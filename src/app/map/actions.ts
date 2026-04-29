'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

export async function getStationVisitHistory(stationId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  return await prisma.visitLog.findMany({
    where: { userId: user.id, stationId },
    orderBy: { visitedAt: 'desc' },
    select: {
      id: true,
      eventType: true,
      visitedAt: true,
      memo: true,
    }
  })
}

export async function getStations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const stations = await prisma.station.findMany({
    select: {
      id: true,
      name: true,
      prefCd: true,
      lat: true,
      lng: true,
      lines: {
        select: {
          lineId: true
        }
      },
      visitLogs: user ? {
        where: { userId: user.id },
        select: { eventType: true }
      } : false
    }
  })

  return stations.map(s => {
    let status = 'UNVISITED'
    if (s.visitLogs && s.visitLogs.length > 0) {
      if (s.visitLogs.some(v => v.eventType === 'ALIGHT')) status = 'ALIGHT'
      else if (s.visitLogs.some(v => v.eventType === 'BOARD')) status = 'BOARD'
      else if (s.visitLogs.some(v => v.eventType === 'PASS')) status = 'PASS'
    }
    
    return {
      id: s.id,
      name: s.name,
      prefCd: s.prefCd,
      lat: s.lat,
      lng: s.lng,
      status,
      lineIds: s.lines.map(l => l.lineId)
    }
  })
}

export async function saveVisitLog(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('認証されていません')
  }

  const stationId = parseInt(formData.get('stationId') as string)
  const eventType = formData.get('status') as 'ALIGHT' | 'BOARD' | 'PASS'
  const visitedAtStr = formData.get('visitedAt') as string
  const memo = formData.get('memo') as string

  if (!stationId || !eventType) {
    throw new Error('必須項目が入力されていません')
  }

  const visitedAt = visitedAtStr ? new Date(visitedAtStr) : new Date()

  await prisma.visitLog.create({
    data: {
      userId: user.id,
      stationId,
      eventType,
      visitedAt,
      memo: memo || null,
    }
  })

  return { success: true }
}

export async function getLineColors() {
  return await prisma.line.findMany({
    select: {
      name: true,
      color: true
    }
  })
}

export async function getLines() {
  return await prisma.line.findMany({
    select: {
      id: true,
      name: true,
      color: true,
    },
    orderBy: { name: 'asc' }
  })
}

export async function getStats(includePass: boolean = true) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const totalStations = await prisma.station.count()
  
  const visitFilter: any = { userId: user.id }
  if (!includePass) {
    visitFilter.eventType = { in: ['BOARD', 'ALIGHT'] }
  }

  const visitedStationsCount = await prisma.visitLog.findMany({
    where: visitFilter,
    distinct: ['stationId'],
    select: { stationId: true }
  })

  const overall = {
    visited: visitedStationsCount.length,
    total: totalStations,
    percentage: totalStations > 0 ? (visitedStationsCount.length / totalStations) * 100 : 0
  }

  const stationsPerPref = await prisma.station.groupBy({
    by: ['prefCd'],
    _count: { id: true }
  })

  const visitedPerPref = await prisma.visitLog.findMany({
    where: visitFilter,
    distinct: ['stationId'],
    select: {
      station: {
        select: { prefCd: true }
      }
    }
  })

  const prefStatsMap = new Map<number, { visited: number, total: number }>()
  
  stationsPerPref.forEach(p => {
    prefStatsMap.set(p.prefCd, { visited: 0, total: p._count.id })
  })

  visitedPerPref.forEach(v => {
    const stats = prefStatsMap.get(v.station.prefCd)
    if (stats) {
      stats.visited += 1
    }
  })

  const prefStats = Array.from(prefStatsMap.entries()).map(([prefCd, stats]) => ({
    prefCd,
    visited: stats.visited,
    total: stats.total,
    percentage: stats.total > 0 ? (stats.visited / stats.total) * 100 : 0
  })).sort((a, b) => a.prefCd - b.prefCd)

  const regions = [
    { name: '北海道', prefs: [1] },
    { name: '東北', prefs: [2, 3, 4, 5, 6, 7] },
    { name: '関東', prefs: [8, 9, 10, 11, 12, 13, 14] },
    { name: '中部', prefs: [15, 16, 17, 18, 19, 20, 21, 22, 23] },
    { name: '近畿', prefs: [24, 25, 26, 27, 28, 29, 30] },
    { name: '中国', prefs: [31, 32, 33, 34, 35] },
    { name: '四国', prefs: [36, 37, 38, 39] },
    { name: '九州沖縄', prefs: [40, 41, 42, 43, 44, 45, 46, 47] },
  ]

  const regionStats = regions.map(r => {
    const rPrefs = prefStats.filter(p => r.prefs.includes(p.prefCd))
    const visited = rPrefs.reduce((sum, p) => sum + p.visited, 0)
    const total = rPrefs.reduce((sum, p) => sum + p.total, 0)
    return {
      name: r.name,
      visited,
      total,
      percentage: total > 0 ? (visited / total) * 100 : 0
    }
  })

  return { overall, prefStats, regionStats }
}

export async function getLineGeometries() {
  const lines = await prisma.line.findMany({
    include: {
      stations: {
        include: {
          station: true
        },
        orderBy: {
          stationOrder: 'asc'
        }
      }
    }
  })

  const features = lines.map(line => ({
    type: 'Feature',
    properties: {
      id: line.id,
      name: line.name,
      color: line.color || '#94a3b8'
    },
    geometry: {
      type: 'LineString',
      coordinates: line.stations.map(sl => [sl.station.lng, sl.station.lat])
    }
  }))

  return {
    type: 'FeatureCollection',
    features
  }
}

export async function searchStations(query: string) {
  if (!query || query.length < 2) return []
  
  return await prisma.station.findMany({
    where: {
      name: { contains: query }
    },
    select: {
      id: true,
      name: true,
      prefCd: true,
      lines: {
        select: {
          line: {
            select: { name: true }
          }
        }
      }
    },
    take: 10
  })
}

export async function findRoute(startId: number, endId: number) {
  // まず同一路線を探す
  const startLines = await prisma.stationLine.findMany({ where: { stationId: startId } })
  const endLines = await prisma.stationLine.findMany({ where: { stationId: endId } })
  
  const commonLineIds = startLines
    .filter(sl => endLines.some(el => el.lineId === sl.lineId))
    .map(sl => sl.lineId)

  const results = []

  // 直通ルート
  for (const lineId of commonLineIds) {
    const line = await prisma.line.findUnique({ where: { id: lineId } })
    const startOrder = startLines.find(sl => sl.lineId === lineId)!.stationOrder
    const endOrder = endLines.find(el => el.lineId === lineId)!.stationOrder

    const minOrder = Math.min(startOrder, endOrder)
    const maxOrder = Math.max(startOrder, endOrder)

    const stationsOnRoute = await prisma.stationLine.findMany({
      where: {
        lineId,
        stationOrder: { gte: minOrder, lte: maxOrder }
      },
      orderBy: { stationOrder: startOrder < endOrder ? 'asc' : 'desc' },
      include: { station: true }
    })

    results.push({
      type: 'direct' as const,
      lineId,
      lineName: line?.name ?? '',
      lineColor: line?.color ?? '#94a3b8',
      stations: stationsOnRoute.map(sl => sl.station),
      transferStation: null
    })
  }

  // 乗り換えルート（直通がない場合）
  if (results.length === 0) {
    // 出発駅の路線の全駅と、到着駅の路線の全駅を取得して乗り換え駅を探す
    const startLineIds = startLines.map(sl => sl.lineId)
    const endLineIds = endLines.map(el => el.lineId)

    // 出発路線に属する全駅
    const startLineStations = await prisma.stationLine.findMany({
      where: { lineId: { in: startLineIds } },
      select: { stationId: true, lineId: true }
    })

    // 到着路線に属する全駅
    const endLineStations = await prisma.stationLine.findMany({
      where: { lineId: { in: endLineIds } },
      select: { stationId: true, lineId: true }
    })

    const startLineStationIds = new Set(startLineStations.map(s => s.stationId))
    const endLineStationIds = new Set(endLineStations.map(s => s.stationId))

    // 乗り換え可能駅（双方の路線に属する駅）
    const transferCandidateIds = [...startLineStationIds].filter(id => endLineStationIds.has(id))

    // 最大5つの乗り換え候補を試す
    for (const transferId of transferCandidateIds.slice(0, 5)) {
      // 出発→乗り換え
      const leg1Lines = startLines.filter(sl =>
        startLineStations.some(s => s.stationId === transferId && s.lineId === sl.lineId)
      )
      // 乗り換え→到着
      const leg2Lines = endLines.filter(el =>
        endLineStations.some(s => s.stationId === transferId && s.lineId === el.lineId)
      )

      for (const leg1 of leg1Lines) {
        for (const leg2 of leg2Lines) {
          const line1 = await prisma.line.findUnique({ where: { id: leg1.lineId } })
          const line2 = await prisma.line.findUnique({ where: { id: leg2.lineId } })
          const transferSL = await prisma.stationLine.findFirst({
            where: { stationId: transferId, lineId: leg1.lineId },
            include: { station: true }
          })

          const startOrder = leg1.stationOrder
          const transferOrder1 = await prisma.stationLine.findFirst({
            where: { stationId: transferId, lineId: leg1.lineId }
          }).then(r => r?.stationOrder ?? 0)

          const transferOrder2 = await prisma.stationLine.findFirst({
            where: { stationId: transferId, lineId: leg2.lineId }
          }).then(r => r?.stationOrder ?? 0)

          const endOrder = (await prisma.stationLine.findFirst({
            where: { stationId: endId, lineId: leg2.lineId }
          }))?.stationOrder ?? 0

          const min1 = Math.min(startOrder, transferOrder1)
          const max1 = Math.max(startOrder, transferOrder1)
          const min2 = Math.min(transferOrder2, endOrder)
          const max2 = Math.max(transferOrder2, endOrder)

          const leg1Stations = await prisma.stationLine.findMany({
            where: { lineId: leg1.lineId, stationOrder: { gte: min1, lte: max1 } },
            orderBy: { stationOrder: startOrder < transferOrder1 ? 'asc' : 'desc' },
            include: { station: true }
          })

          const leg2Stations = await prisma.stationLine.findMany({
            where: { lineId: leg2.lineId, stationOrder: { gte: min2, lte: max2 } },
            orderBy: { stationOrder: transferOrder2 < endOrder ? 'asc' : 'desc' },
            include: { station: true }
          })

          // 乗り換え駅を重複させない
          const allStations = [
            ...leg1Stations.map(sl => sl.station),
            ...leg2Stations.slice(1).map(sl => sl.station)
          ]

          results.push({
            type: 'transfer' as const,
            lineId: leg1.lineId,
            lineName: `${line1?.name} → ${line2?.name}`,
            lineColor: line1?.color ?? '#94a3b8',
            stations: allStations,
            transferStation: transferSL?.station ?? null,
            leg1: { lineName: line1?.name ?? '', lineColor: line1?.color ?? '#94a3b8', stations: leg1Stations.map(sl => sl.station) },
            leg2: { lineName: line2?.name ?? '', lineColor: line2?.color ?? '#94a3b8', stations: leg2Stations.map(sl => sl.station) }
          })
        }
      }
    }
  }

  if (results.length === 0) {
    throw new Error('ルートが見つかりませんでした。直通または乗り換え1回以内のルートのみ対応しています。')
  }

  return results
}

export async function saveBulkVisitLogs(
  stationIds: number[],
  startId: number,
  endId: number,
  visitedAt?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('認証が必要です')

  const date = visitedAt ? new Date(visitedAt) : new Date()

  const data = stationIds.map(id => {
    let eventType: 'BOARD' | 'ALIGHT' | 'PASS' = 'PASS'
    if (id === startId) eventType = 'BOARD'
    else if (id === endId) eventType = 'ALIGHT'
    
    return {
      userId: user.id,
      stationId: id,
      eventType,
      visitedAt: date
    }
  })

  await prisma.visitLog.createMany({
    data
  })

  return { success: true }
}
