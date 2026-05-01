'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

type StationVisitStatus = 'ALIGHT' | 'BOARD' | 'PASS' | 'UNVISITED'

const resolveStationStatus = (logs: { eventType: string }[]): StationVisitStatus => {
  if (logs.some(v => v.eventType === 'ALIGHT')) return 'ALIGHT'
  if (logs.some(v => v.eventType === 'BOARD')) return 'BOARD'
  if (logs.some(v => v.eventType === 'PASS')) return 'PASS'
  return 'UNVISITED'
}

async function getStationStatusUpdates(userId: string, stationIds: number[]) {
  const uniqueStationIds = [...new Set(stationIds)].filter(Boolean)
  if (uniqueStationIds.length === 0) return []

  const logs = await prisma.visitLog.findMany({
    where: {
      userId,
      stationId: { in: uniqueStationIds },
    },
    select: {
      stationId: true,
      eventType: true,
    },
  })

  const logsByStationId = new Map<number, { eventType: string }[]>()
  logs.forEach(log => {
    const stationLogs = logsByStationId.get(log.stationId) ?? []
    stationLogs.push(log)
    logsByStationId.set(log.stationId, stationLogs)
  })

  return uniqueStationIds.map(stationId => ({
    stationId,
    status: resolveStationStatus(logsByStationId.get(stationId) ?? []),
  }))
}

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
    const status = s.visitLogs ? resolveStationStatus(s.visitLogs) : 'UNVISITED'
    
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
  const eventType = formData.get('status') as 'ALIGHT' | 'BOARD' | 'PASS' | 'UNVISITED'
  const visitedAtStr = formData.get('visitedAt') as string
  const memo = formData.get('memo') as string

  if (!stationId || !eventType) {
    throw new Error('必須項目が入力されていません')
  }

  if (eventType === 'UNVISITED') {
    await prisma.visitLog.deleteMany({
      where: {
        userId: user.id,
        stationId,
      }
    })

    return { success: true, updates: [{ stationId, status: 'UNVISITED' as const }] }
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

  return { success: true, updates: await getStationStatusUpdates(user.id, [stationId]) }
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

export async function getOperatorsWithLines() {
  const regions = [
    { id: 'hokkaido', name: '北海道', prefs: [1] },
    { id: 'tohoku', name: '東北', prefs: [2, 3, 4, 5, 6, 7] },
    { id: 'kanto', name: '関東', prefs: [8, 9, 10, 11, 12, 13, 14] },
    { id: 'chubu', name: '中部', prefs: [15, 16, 17, 18, 19, 20, 21, 22, 23] },
    { id: 'kinki', name: '近畿', prefs: [24, 25, 26, 27, 28, 29, 30] },
    { id: 'chugoku', name: '中国', prefs: [31, 32, 33, 34, 35] },
    { id: 'shikoku', name: '四国', prefs: [36, 37, 38, 39] },
    { id: 'kyushu', name: '九州・沖縄', prefs: [40, 41, 42, 43, 44, 45, 46, 47] },
  ]

  const operators = await prisma.operator.findMany({
    select: {
      id: true,
      name: true,
      lines: {
        select: {
          id: true,
          name: true,
          color: true,
          _count: {
            select: { stations: true }
          },
          stations: {
            select: {
              station: {
                select: { prefCd: true }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      }
    },
    orderBy: { name: 'asc' }
  })

  return regions.map(region => ({
    ...region,
    operators: operators
      .map(operator => ({
        ...operator,
        lines: operator.lines
          .filter(line => line.stations.some(sl => region.prefs.includes(sl.station.prefCd)))
          .map(line => ({
            id: line.id,
            name: line.name,
            color: line.color,
            _count: line._count
          }))
      }))
      .filter(operator => operator.lines.length > 0)
  })).filter(region => region.operators.length > 0)
}

export async function getLineStationsForRecording(lineId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('認証されていません')
  }

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    select: {
      id: true,
      name: true,
      color: true,
      operator: {
        select: {
          id: true,
          name: true
        }
      },
      stations: {
        orderBy: { stationOrder: 'asc' },
        select: {
          stationOrder: true,
          station: {
            select: {
              id: true,
              name: true,
              nameKana: true,
              prefCd: true,
              visitLogs: {
                where: { userId: user.id },
                orderBy: { visitedAt: 'desc' },
                select: {
                  id: true,
                  eventType: true,
                  visitedAt: true,
                  memo: true,
                  tripTitle: true
                }
              }
            }
          }
        }
      }
    }
  })

  if (!line) {
    throw new Error('路線が見つかりませんでした')
  }

  return {
    ...line,
    stations: line.stations.map(sl => {
      const logs = sl.station.visitLogs
      let currentStatus: 'VISITED' | 'PASS' | 'UNVISITED' = 'UNVISITED'
      if (logs.some(log => log.eventType === 'ALIGHT')) currentStatus = 'VISITED'
      else if (logs.some(log => log.eventType === 'BOARD')) currentStatus = 'VISITED'
      else if (logs.some(log => log.eventType === 'PASS')) currentStatus = 'PASS'

      const latestLog = logs[0]

      return {
        stationOrder: sl.stationOrder,
        station: {
          id: sl.station.id,
          name: sl.station.name,
          nameKana: sl.station.nameKana,
          prefCd: sl.station.prefCd,
          currentStatus,
          latestLog: latestLog ? {
            id: latestLog.id,
            eventType: latestLog.eventType,
            visitedAt: latestLog.visitedAt.toISOString(),
            memo: latestLog.memo,
            tripTitle: latestLog.tripTitle
          } : null
        }
      }
    })
  }
}

export async function savePendingVisitChanges(entries: {
  stationId: number
  lineId?: number
  eventType: 'BOARD' | 'ALIGHT' | 'VISITED' | 'PASS' | 'UNVISITED'
  visitedAt?: string
  memo?: string
  tripTitle?: string
  sourceType: 'route' | 'line'
}[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('認証されていません')
  }

  const validEntries = entries.filter(entry =>
    entry.stationId &&
    ['BOARD', 'ALIGHT', 'VISITED', 'PASS', 'UNVISITED'].includes(entry.eventType)
  )

  if (validEntries.length === 0) {
    throw new Error('保存する記録がありません')
  }

  const stationIds = [...new Set(validEntries.map(entry => entry.stationId))]
  const logsToCreate = validEntries.filter(entry => entry.eventType !== 'UNVISITED')

  await prisma.$transaction([
    prisma.visitLog.deleteMany({
      where: {
        userId: user.id,
        stationId: { in: stationIds },
      },
    }),
    ...(logsToCreate.length > 0 ? [
      prisma.visitLog.createMany({
        data: logsToCreate.map(entry => ({
          userId: user.id,
          stationId: entry.stationId,
          eventType: entry.eventType === 'VISITED'
            ? 'ALIGHT'
            : entry.eventType === 'BOARD' || entry.eventType === 'ALIGHT' || entry.eventType === 'PASS'
              ? entry.eventType
              : 'PASS',
          visitedAt: entry.visitedAt ? new Date(entry.visitedAt) : new Date(),
          memo: entry.memo?.trim() || null,
          tripTitle: entry.tripTitle?.trim() || null,
        })),
      })
    ] : [])
  ])

  return {
    success: true,
    count: validEntries.length,
    updates: await getStationStatusUpdates(user.id, stationIds),
  }
}

export async function getStats(includePass: boolean = true) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const totalStations = await prisma.station.count()
  
  const visitFilter: { userId: string; eventType?: { in: ('BOARD' | 'ALIGHT')[] } } = { userId: user.id }
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
  if (!query || query.trim().length < 1) return []
  
  return await prisma.station.findMany({
    where: {
      name: { contains: query.trim() }
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

const routeStationSelect = {
  id: true,
  name: true,
  prefCd: true,
  lat: true,
  lng: true,
} as const

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
      select: {
        line: { select: { name: true, color: true } },
        station: { select: routeStationSelect },
      }
    })
    const line = stationsOnRoute[0]?.line

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
          const startOrder = leg1.stationOrder
          const [transferSL, transferOrder2SL, endSL] = await Promise.all([
            prisma.stationLine.findFirst({
              where: { stationId: transferId, lineId: leg1.lineId },
              select: {
                stationOrder: true,
                station: { select: routeStationSelect },
              },
            }),
            prisma.stationLine.findFirst({
              where: { stationId: transferId, lineId: leg2.lineId },
              select: { stationOrder: true },
            }),
            prisma.stationLine.findFirst({
              where: { stationId: endId, lineId: leg2.lineId },
              select: { stationOrder: true },
            }),
          ])

          const transferOrder1 = transferSL?.stationOrder ?? 0
          const transferOrder2 = transferOrder2SL?.stationOrder ?? 0
          const endOrder = endSL?.stationOrder ?? 0

          const min1 = Math.min(startOrder, transferOrder1)
          const max1 = Math.max(startOrder, transferOrder1)
          const min2 = Math.min(transferOrder2, endOrder)
          const max2 = Math.max(transferOrder2, endOrder)

          const [leg1Stations, leg2Stations] = await Promise.all([
            prisma.stationLine.findMany({
              where: { lineId: leg1.lineId, stationOrder: { gte: min1, lte: max1 } },
              orderBy: { stationOrder: startOrder < transferOrder1 ? 'asc' : 'desc' },
              select: {
                line: { select: { name: true, color: true } },
                station: { select: routeStationSelect },
              },
            }),
            prisma.stationLine.findMany({
              where: { lineId: leg2.lineId, stationOrder: { gte: min2, lte: max2 } },
              orderBy: { stationOrder: transferOrder2 < endOrder ? 'asc' : 'desc' },
              select: {
                line: { select: { name: true, color: true } },
                station: { select: routeStationSelect },
              },
            }),
          ])
          const line1 = leg1Stations[0]?.line
          const line2 = leg2Stations[0]?.line

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
