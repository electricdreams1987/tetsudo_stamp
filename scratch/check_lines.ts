import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const lines = await prisma.line.findMany({
    where: {
      name: { contains: '丸ノ内' }
    }
  })
  console.log('Lines:', JSON.stringify(lines, null, 2))

  for (const line of lines) {
    const stations = await prisma.stationLine.findMany({
      where: { lineId: line.id },
      orderBy: { stationOrder: 'asc' },
      include: { station: true }
    })
    console.log(`Line: ${line.name} (${line.id})`)
    console.log(stations.map(s => `${s.stationOrder}: ${s.station.name}`).join(', '))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
