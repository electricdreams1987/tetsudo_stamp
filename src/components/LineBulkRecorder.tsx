'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronDown, ChevronLeft, Loader2, Pencil, Search, Train, X } from 'lucide-react'
import { getLineStationsForRecording, getOperatorsWithLines } from '@/app/map/actions'
import { PendingChangesBar, type PendingVisitChange, usePendingVisitChanges } from '@/hooks/usePendingVisitChanges'

type VisitStatus = 'VISITED' | 'PASS' | 'UNVISITED'
type RegionOption = Awaited<ReturnType<typeof getOperatorsWithLines>>[number]
type LineStations = Awaited<ReturnType<typeof getLineStationsForRecording>>

type DraftEntry = {
  eventType?: VisitStatus
  visitedAt?: string
  memo?: string
  tripTitle?: string
}

let cachedRegions: RegionOption[] | null = null

const STATUS_OPTIONS: { value: VisitStatus; label: string; color: string }[] = [
  { value: 'VISITED', label: '乗車・下車', color: '#e11d48' },
  { value: 'PASS', label: '通過', color: '#f59e0b' },
  { value: 'UNVISITED', label: '未訪問', color: '#64748b' },
]

const today = () => new Date().toISOString().split('T')[0]
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const statusLabel = (status?: VisitStatus | null) => STATUS_OPTIONS.find(option => option.value === status)?.label ?? '未訪問'

type SaveCompleteResult = { updates?: { stationId: number; status: 'ALIGHT' | 'BOARD' | 'PASS' | 'UNVISITED' }[] }

export default function LineBulkRecorder({ onClose, onComplete }: { onClose: () => void; onComplete: (result?: SaveCompleteResult) => void }) {
  const [regions, setRegions] = useState<RegionOption[]>(() => cachedRegions ?? [])
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(() => cachedRegions?.[0]?.id ?? null)
  const [expandedOperatorIds, setExpandedOperatorIds] = useState<Set<number>>(new Set())
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
  const [lineData, setLineData] = useState<LineStations | null>(null)
  const [query, setQuery] = useState('')
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(() => !cachedRegions)
  const [isLoadingLine, setIsLoadingLine] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = usePendingVisitChanges('tetsudo:pending:visit-changes', async (result) => {
    onComplete(result)
    if (selectedLineId) setLineData(await getLineStationsForRecording(selectedLineId))
  })

  useEffect(() => {
    let ignore = false

    if (cachedRegions) {
      return () => {
        ignore = true
      }
    }

    getOperatorsWithLines()
      .then(data => {
        if (ignore) return
        cachedRegions = data
        setRegions(data)
        setSelectedRegionId(data[0]?.id ?? null)
      })
      .catch(e => setError(errorMessage(e, '路線一覧の取得に失敗しました')))
      .finally(() => {
        if (!ignore) setIsLoadingOptions(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  const selectedRegion = regions.find(region => region.id === selectedRegionId)
  const normalizedQuery = query.trim()

  const visibleRegions = useMemo(() => {
    const source = normalizedQuery ? regions : regions.filter(region => region.id === selectedRegionId)
    if (!normalizedQuery) return source

    return source
      .map(region => ({
        ...region,
        operators: region.operators
          .map(operator => ({
            ...operator,
            lines: operator.lines.filter(line =>
              line.name.includes(normalizedQuery) ||
              operator.name.includes(normalizedQuery) ||
              region.name.includes(normalizedQuery)
            )
          }))
          .filter(operator => operator.lines.length > 0)
      }))
      .filter(region => region.operators.length > 0)
  }, [normalizedQuery, regions, selectedRegionId])

  const selectedStation = lineData?.stations.find(row => row.station.id === selectedStationId)?.station ?? null

  const lineProgress = useMemo(() => {
    if (!lineData) return null
    const recorded = lineData.stations.filter(row => row.station.currentStatus !== 'UNVISITED').length
    return {
      recorded,
      total: lineData.stations.length,
      percentage: lineData.stations.length > 0 ? Math.round((recorded / lineData.stations.length) * 100) : 0,
    }
  }, [lineData])

  const draftKey = (stationId: number) => selectedLineId ? `line:${selectedLineId}:${stationId}` : ''

  const getDraft = (stationId: number) =>
    pending.pendingChanges[draftKey(stationId)] as DraftEntry | undefined

  const loadLine = async (lineId: number) => {
    setSelectedLineId(lineId)
    setLineData(null)
    setError(null)
    setIsLoadingLine(true)
    try {
      setLineData(await getLineStationsForRecording(lineId))
    } catch (e: unknown) {
      setError(errorMessage(e, '路線の駅一覧を取得できませんでした'))
    } finally {
      setIsLoadingLine(false)
    }
  }

  const updateDraft = (stationId: number, patch: Partial<DraftEntry>) => {
    if (!selectedLineId) return

    const existing = getDraft(stationId) ?? {
      visitedAt: today(),
      memo: '',
      tripTitle: '',
    }
    const next = { ...existing, ...patch }
    if (!next.eventType) return

    pending.upsertChange({
      stationId,
      lineId: selectedLineId,
      eventType: next.eventType,
      visitedAt: next.visitedAt,
      memo: next.memo,
      tripTitle: next.tripTitle,
      sourceType: 'line',
    } satisfies PendingVisitChange)
  }

  const openLineList = () => {
    setLineData(null)
    setSelectedLineId(null)
  }

  const close = () => {
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm">
      <div className="relative h-full w-full bg-slate-50 md:mx-auto md:my-4 md:h-[calc(100vh-2rem)] md:max-w-5xl md:overflow-hidden md:rounded-2xl md:shadow-2xl">
        <div className="flex h-full flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
            <div className="flex min-w-0 items-center gap-3">
              {lineData && (
                <button onClick={openLineList} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-900 text-white">
                <Train className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-black text-slate-900">路線別まとめて記録</h2>
                <p className="truncate text-[11px] font-bold text-slate-400">
                  {lineData ? `${lineData.operator.name} / ${lineData.name}` : selectedRegion?.name ?? '地域を選択'}
                </p>
              </div>
            </div>
            <button onClick={close} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </header>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          {!lineData ? (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 p-4 md:grid-cols-[220px_1fr] md:grid-rows-1">
              <section className="rounded-lg border bg-white">
                <div className="border-b p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">地域</p>
                </div>
                <div className="flex gap-2 overflow-x-auto p-2 md:block md:max-h-full md:overflow-y-auto">
                  {isLoadingOptions ? (
                    <div className="flex items-center gap-2 p-3 text-sm font-bold text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中
                    </div>
                  ) : regions.map(region => (
                    <button
                      key={region.id}
                      onClick={() => {
                        setSelectedRegionId(region.id)
                        setExpandedOperatorIds(new Set())
                      }}
                      className={`mb-0 flex shrink-0 items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold transition-colors md:mb-1 md:w-full ${
                        selectedRegionId === region.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 md:bg-white'
                      }`}
                    >
                      <span className="truncate">{region.name}</span>
                      <span className="ml-2 text-[10px] opacity-70">{region.operators.length}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="min-h-0 rounded-lg border bg-white">
                <div className="space-y-3 border-b p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">事業者・路線</p>
                    <span className="text-xs font-bold text-slate-500">
                      {normalizedQuery ? '全地域から検索' : selectedRegion?.name}
                    </span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="事業者名・路線名で検索"
                      className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="max-h-[calc(100vh-17rem)] overflow-y-auto p-3 md:max-h-full">
                  {visibleRegions.length === 0 && (
                    <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">
                      該当する路線がありません
                    </div>
                  )}

                  {visibleRegions.map(region => (
                    <div key={region.id} className="mb-4">
                      {normalizedQuery && (
                        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{region.name}</p>
                      )}
                      <div className="space-y-2">
                        {region.operators.map(operator => {
                          const expanded = normalizedQuery || expandedOperatorIds.has(operator.id)
                          return (
                            <div key={`${region.id}-${operator.id}`} className="rounded-lg border border-slate-200">
                              <button
                                onClick={() => {
                                  setExpandedOperatorIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(operator.id)) next.delete(operator.id)
                                    else next.add(operator.id)
                                    return next
                                  })
                                }}
                                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-slate-800">{operator.name}</p>
                                  <p className="text-[11px] font-bold text-slate-400">{operator.lines.length}路線</p>
                                </div>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                              </button>

                              {expanded && (
                                <div className="grid grid-cols-1 gap-2 border-t bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {operator.lines.map(line => (
                                    <button
                                      key={`${region.id}-${line.id}`}
                                      onClick={() => loadLine(line.id)}
                                      className="flex min-h-20 flex-col justify-between rounded-md border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-400"
                                    >
                                      <div className="flex items-start gap-2">
                                        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: line.color || '#64748b' }} />
                                        <span className="text-sm font-black text-slate-800">{line.name}</span>
                                      </div>
                                      <span className="mt-3 text-[11px] font-bold text-slate-400">{line._count.stations}駅</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-28">
              <div className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">選択中の路線</p>
                    <h3 className="truncate text-xl font-black text-slate-900">{lineData.name}</h3>
                  </div>
                  <div className="rounded-full px-3 py-1 text-xs font-black text-white" style={{ backgroundColor: lineData.color || '#64748b' }}>
                    {lineData.stations.length}駅
                  </div>
                </div>
                {lineProgress && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-black text-slate-400">
                      <span>路線達成率</span>
                      <span>{lineProgress.recorded}/{lineProgress.total}駅 ({lineProgress.percentage}%)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${lineProgress.percentage}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {isLoadingLine ? (
                <div className="flex h-64 items-center justify-center gap-2 text-sm font-bold text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" /> 駅一覧を読み込み中
                </div>
              ) : (
                <div className="mx-auto max-w-3xl px-3 py-4">
                  {lineData.stations.map((row, index) => {
                    const station = row.station
                    const draft = getDraft(station.id)
                    const activeStatus = draft?.eventType
                    const savedStatus = station.currentStatus

                    return (
                      <div key={`${station.id}-${row.stationOrder}`} className="grid grid-cols-[28px_1fr] gap-3">
                        <div className="relative flex justify-center">
                          {index > 0 && <span className="absolute top-0 h-1/2 w-1 rounded bg-slate-300" />}
                          {index < lineData.stations.length - 1 && <span className="absolute bottom-0 h-1/2 w-1 rounded bg-slate-300" />}
                          <span className="relative z-10 mt-7 h-4 w-4 rounded-full border-4 bg-white" style={{ borderColor: lineData.color || '#334155' }} />
                        </div>

                        <div className="border-b border-slate-200 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button onClick={() => setSelectedStationId(station.id)} className="min-w-0 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-black text-slate-900">{station.name}</span>
                                <Pencil className="h-3.5 w-3.5 text-slate-300" />
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-400">現在: {statusLabel(savedStatus)}</span>
                                {activeStatus && (
                                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white">
                                    変更: {statusLabel(activeStatus)}
                                  </span>
                                )}
                                {draft?.memo && <span className="text-[10px] font-bold text-slate-400">メモあり</span>}
                              </div>
                            </button>

                            <div className="grid grid-cols-3 gap-1.5 sm:w-64">
                              {STATUS_OPTIONS.map(option => {
                                const selected = activeStatus === option.value
                                const saved = !activeStatus && savedStatus === option.value
                                return (
                                  <button
                                    key={option.value}
                                    onClick={() => updateDraft(station.id, { eventType: option.value })}
                                    className={`h-10 rounded-md border text-xs font-black transition-all ${
                                      selected
                                        ? 'border-transparent text-white shadow-sm'
                                        : saved
                                          ? 'border-slate-300 bg-slate-100 text-slate-700'
                                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                                    }`}
                                    style={selected ? { backgroundColor: option.color } : undefined}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <PendingChangesBar
                count={pending.pendingCount}
                isSaving={pending.isSaving}
                saveStatus={pending.saveStatus}
                onSave={pending.saveChanges}
                onDiscard={pending.clearChanges}
                saveLabel="保存"
              />
            </div>
          )}
        </div>
      </div>

      {selectedStation && (
        <div className="fixed inset-0 z-[120] flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">駅詳細</p>
                <h3 className="text-2xl font-black text-slate-900">{selectedStation.name}</h3>
                <p className="text-xs font-bold text-slate-400">現在: {statusLabel(selectedStation.currentStatus)}</p>
              </div>
              <button onClick={() => setSelectedStationId(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map(option => {
                  const selected = getDraft(selectedStation.id)?.eventType === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => updateDraft(selectedStation.id, { eventType: option.value })}
                      className={`h-11 rounded-lg border text-sm font-black ${selected ? 'border-transparent text-white' : 'border-slate-200 text-slate-600'}`}
                      style={selected ? { backgroundColor: option.color } : undefined}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <label className="block space-y-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Calendar className="h-3.5 w-3.5" /> 日付
                </span>
                <input
                  type="date"
                  value={getDraft(selectedStation.id)?.visitedAt ?? selectedStation.latestLog?.visitedAt?.slice(0, 10) ?? today()}
                  onChange={e => updateDraft(selectedStation.id, {
                    visitedAt: e.target.value,
                    eventType: getDraft(selectedStation.id)?.eventType ?? selectedStation.currentStatus,
                  })}
                  className="h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">旅タイトル</span>
                <input
                  value={getDraft(selectedStation.id)?.tripTitle ?? selectedStation.latestLog?.tripTitle ?? ''}
                  onChange={e => updateDraft(selectedStation.id, {
                    tripTitle: e.target.value,
                    eventType: getDraft(selectedStation.id)?.eventType ?? selectedStation.currentStatus,
                  })}
                  placeholder="例: 春の東海道旅"
                  className="h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">メモ</span>
                <textarea
                  value={getDraft(selectedStation.id)?.memo ?? selectedStation.latestLog?.memo ?? ''}
                  onChange={e => updateDraft(selectedStation.id, {
                    memo: e.target.value,
                    eventType: getDraft(selectedStation.id)?.eventType ?? selectedStation.currentStatus,
                  })}
                  placeholder="駅ごとのメモ"
                  className="h-24 w-full resize-none rounded-lg border bg-slate-50 p-3 text-sm font-medium outline-none focus:border-slate-400"
                />
              </label>

              <Button type="button" onClick={() => setSelectedStationId(null)} className="h-12 w-full rounded-lg bg-slate-900 font-black text-white">
                反映
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
