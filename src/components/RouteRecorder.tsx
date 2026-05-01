'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X, Search, Train, ArrowRight, Check, Calendar } from 'lucide-react'
import { searchStations, findRoute } from '@/app/map/actions'
import { PendingChangesBar, type PendingVisitChange, usePendingVisitChanges } from '@/hooks/usePendingVisitChanges'

interface StationResult {
  id: number;
  name: string;
  prefCd: number;
  lines: { line: { name: string } }[];
}

interface RouteStation {
  id: number;
  name: string;
}

interface RouteCandidate {
  type: 'direct' | 'transfer';
  lineId: number;
  lineName: string;
  lineColor: string;
  stations: RouteStation[];
  transferStation: RouteStation | null;
  leg1?: { lineName: string; lineColor: string; stations: RouteStation[] };
  leg2?: { lineName: string; lineColor: string; stations: RouteStation[] };
}

export default function RouteRecorder({ onClose, onComplete }: { onClose: () => void, onComplete: () => void }) {
  const [startQuery, setStartQuery] = useState('')
  const [endQuery, setEndQuery] = useState('')
  const [startResults, setStartResults] = useState<StationResult[]>([])
  const [endResults, setEndResults] = useState<StationResult[]>([])
  const [startStation, setStartStation] = useState<StationResult | null>(null)
  const [endStation, setEndStation] = useState<StationResult | null>(null)
  const [candidates, setCandidates] = useState<RouteCandidate[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [useDate, setUseDate] = useState(true)
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const pending = usePendingVisitChanges('tetsudo:pending:visit-changes', async () => {
    onComplete()
    onClose()
  })

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (startQuery.trim().length >= 1) {
        const res = await searchStations(startQuery)
        setStartResults(res as StationResult[])
      } else {
        setStartResults([])
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [startQuery])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (endQuery.trim().length >= 1) {
        const res = await searchStations(endQuery)
        setEndResults(res as StationResult[])
      } else {
        setEndResults([])
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [endQuery])

  const handleFindRoute = async () => {
    if (!startStation || !endStation) return
    setIsSearching(true)
    setError(null)
    setCandidates([])
    setSelectedRoute(null)
    try {
      const res = await findRoute(startStation.id, endStation.id)
      setCandidates(res as RouteCandidate[])
      if (res.length > 0) setSelectedRoute(res[0] as RouteCandidate)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ルート検索に失敗しました')
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddPending = () => {
    if (!selectedRoute || !startStation || !endStation) return

    const changes: PendingVisitChange[] = selectedRoute.stations.map(station => ({
      stationId: station.id,
      lineId: selectedRoute.lineId,
      eventType: station.id === startStation.id ? 'BOARD' : station.id === endStation.id ? 'ALIGHT' : 'PASS',
      visitedAt: useDate ? visitedAt : undefined,
      sourceType: 'route',
    }))

    pending.upsertChanges(changes)
    setError(null)
  }

  const LineChip = ({ name, color }: { name: string, color: string }) => (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white"
      style={{ backgroundColor: color || '#64748b' }}
    >
      {name}
    </span>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* ヘッダー */}
        <div className="p-5 border-b flex justify-between items-center bg-slate-900 text-white shrink-0">
          <h2 className="text-xl font-black flex items-center gap-2">
            <Train className="w-6 h-6 text-primary" /> ルート一括記録
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-28 space-y-5">
          {/* 乗車駅 */}
          <StationSearchField
            label="乗車駅"
            placeholder="出発駅を入力..."
            query={startQuery}
            setQuery={setStartQuery}
            results={startResults}
            selected={startStation}
            onSelect={(s) => { setStartStation(s); setStartQuery(''); setCandidates([]); setSelectedRoute(null) }}
            onClear={() => { setStartStation(null); setCandidates([]); setSelectedRoute(null) }}
          />

          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* 下車駅 */}
          <StationSearchField
            label="下車駅"
            placeholder="到着駅を入力..."
            query={endQuery}
            setQuery={setEndQuery}
            results={endResults}
            selected={endStation}
            onSelect={(s) => { setEndStation(s); setEndQuery(''); setCandidates([]); setSelectedRoute(null) }}
            onClear={() => { setEndStation(null); setCandidates([]); setSelectedRoute(null) }}
          />

          {/* 日付設定 */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> 乗車日
              </label>
              <button
                onClick={() => setUseDate(!useDate)}
                className={`text-[10px] font-black px-2 py-1 rounded-lg transition-all ${useDate ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-400'}`}
              >
                {useDate ? '日付あり' : '日付なし'}
              </button>
            </div>
            {useDate && (
              <input
                type="date"
                value={visitedAt}
                onChange={e => setVisitedAt(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 p-2 rounded-xl text-sm font-medium focus:outline-none focus:border-primary transition-all"
              />
            )}
          </div>

          {/* 検索ボタン */}
          <Button
            onClick={handleFindRoute}
            disabled={!startStation || !endStation || isSearching}
            className="w-full py-5 rounded-2xl bg-primary text-white font-black text-sm"
          >
            {isSearching ? 'ルート検索中...' : 'ルートを検索する'}
          </Button>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* ルート候補 */}
          {candidates.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                ルート候補 ({candidates.length}件)
              </p>
              {candidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedRoute(c)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${selectedRoute === c ? 'border-primary bg-primary/5 shadow-md' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1.5">
                      {c.type === 'direct' ? (
                        <LineChip name={c.lineName} color={c.lineColor} />
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          <LineChip name={c.leg1?.lineName ?? ''} color={c.leg1?.lineColor ?? '#64748b'} />
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-[10px] font-bold text-slate-500">乗換：{c.transferStation?.name}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <LineChip name={c.leg2?.lineName ?? ''} color={c.leg2?.lineColor ?? '#64748b'} />
                        </div>
                      )}
                    </div>
                    {selectedRoute === c && <Check className="w-5 h-5 text-primary shrink-0" />}
                  </div>

                  <div className="text-[11px] text-slate-400 leading-relaxed line-clamp-2 mt-1">
                    {c.type === 'transfer' ? (
                      <>
                        <span className="text-slate-500 font-medium">{c.leg1?.stations.map(s => s.name).join('→')}</span>
                        <span className="mx-1 text-amber-500 font-black">⟳</span>
                        <span className="text-slate-500 font-medium">{c.leg2?.stations.map(s => s.name).join('→')}</span>
                      </>
                    ) : (
                      c.stations.map(s => s.name).join(' → ')
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-black text-primary">{c.stations.length}駅を記録</span>
                    {c.type === 'transfer' && (
                      <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">乗り換えあり</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 未保存追加ボタン */}
        <div className="p-5 border-t bg-slate-50 shrink-0">
          <Button
            onClick={handleAddPending}
            disabled={!selectedRoute}
            className="w-full py-7 rounded-2xl bg-slate-900 text-white font-black text-lg shadow-xl hover:bg-black transition-all disabled:opacity-40"
          >
            {`このルートを未保存に追加 (${selectedRoute?.stations.length ?? 0}駅)`}
          </Button>
        </div>

        <PendingChangesBar
          count={pending.pendingCount}
          isSaving={pending.isSaving}
          saveStatus={pending.saveStatus}
          onSave={pending.saveChanges}
          onDiscard={pending.clearChanges}
          saveLabel="保存"
        />
      </div>
    </div>
  )
}

function StationSearchField({
  label, placeholder, query, setQuery, results, selected, onSelect, onClear
}: {
  label: string;
  placeholder: string;
  query: string;
  setQuery: (v: string) => void;
  results: StationResult[];
  selected: StationResult | null;
  onSelect: (s: StationResult) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={selected ? selected.name : query}
          onChange={e => {
            setQuery(e.target.value)
            if (selected) onClear()
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-9 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-primary outline-none transition-all font-bold text-sm"
        />
        {selected && (
          <button onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-200 p-1 rounded-full hover:bg-slate-300 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {!selected && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-0 transition-colors flex justify-between items-center gap-2"
            >
              <span className="font-bold text-sm text-slate-800">{s.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{s.lines[0]?.line.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
