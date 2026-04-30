'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar, Check, ChevronLeft, Loader2, Pencil, Search, Train, X } from 'lucide-react'
import { getLineStationsForRecording, getOperatorsWithLines, saveLineVisitLogs } from '@/app/map/actions'

type VisitStatus = 'BOARD' | 'PASS' | 'ALIGHT'

type OperatorOption = {
  id: number
  name: string
  lines: {
    id: number
    name: string
    color: string | null
    _count: { stations: number }
  }[]
}

type LineStations = Awaited<ReturnType<typeof getLineStationsForRecording>>

type DraftEntry = {
  eventType?: VisitStatus
  visitedAt: string
  memo: string
  tripTitle: string
}

const STATUS_OPTIONS: { value: VisitStatus; label: string; color: string }[] = [
  { value: 'BOARD', label: '乗車', color: '#e11d48' },
  { value: 'PASS', label: '通過', color: '#f59e0b' },
  { value: 'ALIGHT', label: '下車', color: '#0f766e' },
]

const statusLabel = (status?: VisitStatus | null) => {
  if (status === 'BOARD') return '乗車'
  if (status === 'PASS') return '通過'
  if (status === 'ALIGHT') return '下車'
  return '未記録'
}

const today = () => new Date().toISOString().split('T')[0]

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export default function LineBulkRecorder({
  onClose,
  onComplete,
}: {
  onClose: () => void
  onComplete: () => void
}) {
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [selectedOperatorId, setSelectedOperatorId] = useState<number | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
  const [lineData, setLineData] = useState<LineStations | null>(null)
  const [drafts, setDrafts] = useState<Record<number, DraftEntry>>({})
  const [lineQuery, setLineQuery] = useState('')
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null)
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)
  const [isLoadingLine, setIsLoadingLine] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    getOperatorsWithLines()
      .then(data => {
        if (ignore) return
        setOperators(data as OperatorOption[])
      })
      .catch(e => setError(e.message || '路線一覧の取得に失敗しました'))
      .finally(() => {
        if (!ignore) setIsLoadingOptions(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  const selectedOperator = operators.find(operator => operator.id === selectedOperatorId)

  const filteredLines = useMemo(() => {
    const lines = selectedOperator?.lines ?? []
    const query = lineQuery.trim()
    if (!query) return lines
    return lines.filter(line => line.name.includes(query))
  }, [selectedOperator, lineQuery])

  const selectedStation = lineData?.stations.find(row => row.station.id === selectedStationId)?.station ?? null

  const changedCount = useMemo(
    () => Object.values(drafts).filter(draft => draft.eventType).length,
    [drafts]
  )

  const lineProgress = useMemo(() => {
    if (!lineData) return null
    const recorded = lineData.stations.filter(row => row.station.currentStatus).length
    return {
      recorded,
      total: lineData.stations.length,
      percentage: lineData.stations.length > 0 ? Math.round((recorded / lineData.stations.length) * 100) : 0,
    }
  }, [lineData])

  const loadLine = async (lineId: number) => {
    setSelectedLineId(lineId)
    setLineData(null)
    setDrafts({})
    setError(null)
    setIsLoadingLine(true)
    try {
      const data = await getLineStationsForRecording(lineId)
      setLineData(data)
    } catch (e: unknown) {
      setError(errorMessage(e, '路線の駅一覧を取得できませんでした'))
    } finally {
      setIsLoadingLine(false)
    }
  }

  const updateDraft = (stationId: number, patch: Partial<DraftEntry>) => {
    setDrafts(prev => {
      const existing = prev[stationId] ?? {
        visitedAt: today(),
        memo: '',
        tripTitle: '',
      }
      const next = {
        ...existing,
        ...patch,
      }

      if (!next.eventType && !next.memo && !next.tripTitle) {
        const copy = { ...prev }
        delete copy[stationId]
        return copy
      }

      return { ...prev, [stationId]: next }
    })
  }

  const selectStatus = (stationId: number, status: VisitStatus) => {
    const current = drafts[stationId]?.eventType
    updateDraft(stationId, { eventType: current === status ? undefined : status })
  }

  const handleSave = async () => {
    const entries = Object.entries(drafts)
      .map(([stationId, draft]) => ({ stationId: Number(stationId), ...draft }))
      .filter(entry => entry.eventType) as (DraftEntry & { stationId: number; eventType: VisitStatus })[]

    if (entries.length === 0 || isSaving) return

    setIsSaving(true)
    setError(null)
    try {
      await saveLineVisitLogs(entries)
      setDrafts({})
      onComplete()
      if (selectedLineId) {
        const data = await getLineStationsForRecording(selectedLineId)
        setLineData(data)
      }
    } catch (e: unknown) {
      setError(errorMessage(e, '一括保存に失敗しました'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm">
      <div className="h-full w-full bg-slate-50 md:mx-auto md:my-4 md:h-[calc(100vh-2rem)] md:max-w-5xl md:overflow-hidden md:rounded-2xl md:shadow-2xl">
        <div className="flex h-full flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
            <div className="flex min-w-0 items-center gap-3">
              {lineData && (
                <button
                  onClick={() => {
                    setLineData(null)
                    setSelectedLineId(null)
                    setDrafts({})
                  }}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-900 text-white">
                <Train className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-black text-slate-900">路線別まとめて記録</h2>
                <p className="truncate text-[11px] font-bold text-slate-400">
                  {lineData ? `${lineData.operator.name} / ${lineData.name}` : '事業者と路線を選択'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </header>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          {!lineData ? (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 p-4 md:grid-cols-[280px_1fr] md:grid-rows-1">
              <section className="min-h-0 rounded-lg border bg-white">
                <div className="border-b p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">事業者</p>
                </div>
                <div className="max-h-48 overflow-y-auto p-2 md:max-h-full">
                  {isLoadingOptions ? (
                    <div className="flex items-center gap-2 p-3 text-sm font-bold text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中
                    </div>
                  ) : operators.map(operator => (
                    <button
                      key={operator.id}
                      onClick={() => {
                        setSelectedOperatorId(operator.id)
                        setLineQuery('')
                      }}
                      className={`mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold transition-colors ${
                        selectedOperatorId === operator.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{operator.name}</span>
                      <span className="ml-2 text-[10px] opacity-70">{operator.lines.length}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="min-h-0 rounded-lg border bg-white">
                <div className="space-y-3 border-b p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">路線</p>
                    {selectedOperator && <span className="text-xs font-bold text-slate-500">{selectedOperator.name}</span>}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={lineQuery}
                      onChange={e => setLineQuery(e.target.value)}
                      placeholder="路線名で絞り込み"
                      className="h-10 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
                <div className="grid max-h-[calc(100vh-17rem)] grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 md:max-h-full">
                  {!selectedOperator && (
                    <div className="col-span-full flex h-40 items-center justify-center text-sm font-bold text-slate-400">
                      左から事業者を選択してください
                    </div>
                  )}
                  {selectedOperator && filteredLines.map(line => (
                    <button
                      key={line.id}
                      onClick={() => loadLine(line.id)}
                      className="flex min-h-20 flex-col justify-between rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-400 hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: line.color || '#64748b' }} />
                        <span className="text-sm font-black text-slate-800">{line.name}</span>
                      </div>
                      <span className="mt-3 text-[11px] font-bold text-slate-400">{line._count.stations}駅</span>
                    </button>
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
                      <div
                        className="h-full rounded-full bg-slate-900 transition-all"
                        style={{ width: `${lineProgress.percentage}%` }}
                      />
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
                    const draft = drafts[station.id]
                    const activeStatus = draft?.eventType
                    const savedStatus = station.currentStatus

                    return (
                      <div key={`${station.id}-${row.stationOrder}`} className="grid grid-cols-[28px_1fr] gap-3">
                        <div className="relative flex justify-center">
                          {index > 0 && <span className="absolute top-0 h-1/2 w-1 rounded bg-slate-300" />}
                          {index < lineData.stations.length - 1 && <span className="absolute bottom-0 h-1/2 w-1 rounded bg-slate-300" />}
                          <span
                            className="relative z-10 mt-7 h-4 w-4 rounded-full border-4 bg-white"
                            style={{ borderColor: lineData.color || '#334155' }}
                          />
                        </div>

                        <div className="border-b border-slate-200 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                              onClick={() => setSelectedStationId(station.id)}
                              className="min-w-0 text-left"
                            >
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

                            <div className="grid grid-cols-3 gap-1.5 sm:w-56">
                              {STATUS_OPTIONS.map(option => {
                                const selected = activeStatus === option.value
                                const saved = !activeStatus && savedStatus === option.value
                                return (
                                  <button
                                    key={option.value}
                                    onClick={() => selectStatus(station.id, option.value)}
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

              <div className="fixed bottom-0 left-0 right-0 z-[110] border-t bg-white/95 p-3 backdrop-blur md:absolute">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">保存前の変更</p>
                    <p className="text-sm font-black text-slate-900">{changedCount}駅をまとめて更新</p>
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={changedCount === 0 || isSaving}
                    className="h-12 rounded-lg bg-slate-900 px-5 font-black text-white disabled:opacity-40"
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 保存中</span>
                    ) : (
                      <span className="flex items-center gap-2"><Check className="h-4 w-4" /> まとめて更新</span>
                    )}
                  </Button>
                </div>
              </div>
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
                  const selected = drafts[selectedStation.id]?.eventType === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => selectStatus(selectedStation.id, option.value)}
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
                  value={drafts[selectedStation.id]?.visitedAt ?? selectedStation.latestLog?.visitedAt?.slice(0, 10) ?? today()}
                  onChange={e => updateDraft(selectedStation.id, {
                    visitedAt: e.target.value,
                    eventType: drafts[selectedStation.id]?.eventType ?? selectedStation.currentStatus ?? undefined,
                  })}
                  className="h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">旅タイトル</span>
                <input
                  value={drafts[selectedStation.id]?.tripTitle ?? selectedStation.latestLog?.tripTitle ?? ''}
                  onChange={e => updateDraft(selectedStation.id, {
                    tripTitle: e.target.value,
                    eventType: drafts[selectedStation.id]?.eventType ?? selectedStation.currentStatus ?? undefined,
                  })}
                  placeholder="例: 春の東海道旅"
                  className="h-11 w-full rounded-lg border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-slate-400"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">メモ</span>
                <textarea
                  value={drafts[selectedStation.id]?.memo ?? selectedStation.latestLog?.memo ?? ''}
                  onChange={e => updateDraft(selectedStation.id, {
                    memo: e.target.value,
                    eventType: drafts[selectedStation.id]?.eventType ?? selectedStation.currentStatus ?? undefined,
                  })}
                  placeholder="駅ごとのメモ"
                  className="h-24 w-full resize-none rounded-lg border bg-slate-50 p-3 text-sm font-medium outline-none focus:border-slate-400"
                />
              </label>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => setSelectedStationId(null)}
                  className="h-12 flex-1 rounded-lg bg-slate-900 font-black text-white"
                >
                  反映
                </Button>
                <button
                  onClick={() => {
                    setDrafts(prev => {
                      const copy = { ...prev }
                      delete copy[selectedStation.id]
                      return copy
                    })
                    setSelectedStationId(null)
                  }}
                  className="h-12 rounded-lg border px-4 text-sm font-black text-slate-500"
                >
                  クリア
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
