import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { parse } from 'csv-parse/sync'

import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  const dbPath = path.join(process.cwd(), 'tetsudo_datebase')
  
  // 1. Operators
  console.log('Parsing operators...')
  const operatorsCsv = fs.readFileSync(path.join(dbPath, 'company20260409.csv'), 'utf8')
  const operators = parse(operatorsCsv, { columns: true, skip_empty_lines: true })
  
  const opData = operators
    .filter((op: any) => op.e_status === '0')
    .map((op: any) => ({
      id: parseInt(op.company_cd),
      name: op.company_name,
      nameKana: op.company_name_k || null,
    }))
  
  await prisma.operator.createMany({
    data: opData,
    skipDuplicates: true,
  })
  console.log(`Imported ${opData.length} operators.`)

  // 2. Lines
  console.log('Parsing lines...')
  const linesCsv = fs.readFileSync(path.join(dbPath, 'line20260409free.csv'), 'utf8')
  const lines = parse(linesCsv, { columns: true, skip_empty_lines: true })
  
  // Filter lines to only include those where operator exists (in case of e_status differences)
  const validOpIds = new Set(opData.map((op: any) => op.id))
  
  const lineData = lines
    .filter((line: any) => line.e_status === '0' && validOpIds.has(parseInt(line.company_cd)))
    .map((line: any) => ({
      id: parseInt(line.line_cd),
      operatorId: parseInt(line.company_cd),
      name: line.line_name,
      nameKana: line.line_name_k || null,
      color: line.line_color_c ? `#${line.line_color_c}` : null,
    }))

  await prisma.line.createMany({
    data: lineData,
    skipDuplicates: true,
  })
  console.log(`Imported ${lineData.length} lines.`)

  // 3. Stations & StationLines
  console.log('Parsing stations...')
  const stationsCsv = fs.readFileSync(path.join(dbPath, 'station20260409free.csv'), 'utf8')
  const stations = parse(stationsCsv, { columns: true, skip_empty_lines: true })
  
  const validLineIds = new Set(lineData.map((line: any) => line.id))
  
  const uniqueStations = new Map<number, any>()
  const stationLineData: any[] = []

  stations.forEach((st: any) => {
    if (st.e_status === '0' && validLineIds.has(parseInt(st.line_cd))) {
      const groupId = parseInt(st.station_g_cd)
      if (!uniqueStations.has(groupId)) {
        uniqueStations.set(groupId, {
          id: groupId,
          name: st.station_name,
          nameKana: st.station_name_k || null,
          prefCd: parseInt(st.pref_cd),
          lat: parseFloat(st.lat),
          lng: parseFloat(st.lon),
        })
      }
      
      stationLineData.push({
        stationId: groupId,
        lineId: parseInt(st.line_cd),
        stationOrder: parseInt(st.e_sort)
      })
    }
  })

  const stationData = Array.from(uniqueStations.values())

  await prisma.station.createMany({
    data: stationData,
    skipDuplicates: true,
  })
  console.log(`Imported ${stationData.length} stations.`)

  await prisma.stationLine.createMany({
    data: stationLineData,
    skipDuplicates: true,
  })
  console.log(`Imported ${stationLineData.length} station-line relationships.`)

  console.log('Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
