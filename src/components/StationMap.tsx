'use client'

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useMemo, useEffect } from 'react'
import Map, { Source, Layer, NavigationControl, GeolocateControl, type LayerProps } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '@/components/ui/button'
import { X, Calendar, Filter, Route, ChevronDown, Clock } from 'lucide-react'
import { getStations, saveVisitLog, getLineColors, getLines, getStationVisitHistory } from '@/app/map/actions'
import RouteRecorder from './RouteRecorder'
import LineBulkRecorder from './LineBulkRecorder'

type StationStatus = 'ALIGHT' | 'BOARD' | 'PASS' | 'UNVISITED'

interface Station {
  id: number
  name: string
  prefCd: number
  lat: number
  lng: number
  status: StationStatus
  lineIds: number[]
}

interface LineInfo {
  id: number
  name: string
  color: string | null
}

let cachedStations: Station[] | null = null
let cachedLineColors: { name: string; color: string | null }[] | null = null
let cachedLines: LineInfo[] | null = null

const PREF_NAMES: Record<number, string> = {
  1: '北海道', 2: '青森県', 3: '岩手県', 4: '宮城県', 5: '秋田県',
  6: '山形県', 7: '福島県', 8: '茨城県', 9: '栃木県', 10: '群馬県',
  11: '埼玉県', 12: '千葉県', 13: '東京都', 14: '神奈川県', 15: '新潟県',
  16: '富山県', 17: '石川県', 18: '福井県', 19: '山梨県', 20: '長野県',
  21: '岐阜県', 22: '静岡県', 23: '愛知県', 24: '三重県', 25: '滋賀県',
  26: '京都府', 27: '大阪府', 28: '兵庫県', 29: '奈良県', 30: '和歌山県',
  31: '鳥取県', 32: '島根県', 33: '岡山県', 34: '広島県', 35: '山口県',
  36: '徳島県', 37: '香川県', 38: '愛媛県', 39: '高知県', 40: '福岡県',
  41: '佐賀県', 42: '長崎県', 43: '熊本県', 44: '大分県', 45: '宮崎県',
  46: '鹿児島県', 47: '沖縄県'
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'すべて', color: '#64748b' },
  { value: 'VISITED', label: '乗車・下車', color: '#e11d48' },
  { value: 'PASS', label: '通過のみ', color: '#fbbf24' },
  { value: 'UNVISITED', label: '未訪問', color: '#cbd5e1' },
] as const

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ALIGHT':
    case 'BOARD': return '#e11d48'
    case 'PASS': return '#fbbf24'
    default: return '#94a3b8'
  }
}

export default function StationMap() {
  const [viewState, setViewState] = useState({ longitude: 138.0, latitude: 38.0, zoom: 4.5 })
  const [stations, setStations] = useState<Station[]>([])
  const [lineColors, setLineColors] = useState<any[]>([])
  const [lines, setLines] = useState<LineInfo[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [visitHistory, setVisitHistory] = useState<any[]>([])
  const [filterPref, setFilterPref] = useState<string>('ALL')
  const [filterLine, setFilterLine] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showRouteRecorder, setShowRouteRecorder] = useState(false)
  const [showLineBulkRecorder, setShowLineBulkRecorder] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const loadStations = async () => {
    if (cachedStations && cachedLineColors && cachedLines) {
      setStations(cachedStations)
      setLineColors(cachedLineColors)
      setLines(cachedLines)
      setIsLoading(false)
      return
    }

    try {
      const [stationData, colors, lineList] = await Promise.all([
        getStations(),
        getLineColors(),
        getLines()
      ])
      cachedStations = stationData as Station[]
      cachedLineColors = colors
      cachedLines = lineList as LineInfo[]
      setStations(cachedStations)
      setLineColors(cachedLineColors)
      setLines(cachedLines)
    } catch (error) {
      console.error('Failed to load map data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshStationStatuses = async () => {
    const stationData = await getStations()
    cachedStations = stationData as Station[]
    setStations(cachedStations)
  }

  useEffect(() => { loadStations() }, [])

  // GeoJSON生成（フィルタ適用）
  const geojson = useMemo(() => {
    const filtered = stations.filter(s => {
      if (filterPref !== 'ALL' && s.prefCd.toString() !== filterPref) return false
      if (filterLine !== 'ALL' && !s.lineIds.includes(Number(filterLine))) return false
      if (filterStatus === 'VISITED' && s.status !== 'ALIGHT' && s.status !== 'BOARD') return false
      if (filterStatus === 'PASS' && s.status !== 'PASS') return false
      if (filterStatus === 'UNVISITED' && s.status !== 'UNVISITED') return false
      return true
    })

    return {
      type: 'FeatureCollection',
      features: filtered.map(station => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
        properties: {
          id: station.id,
          name: station.name,
          prefCd: station.prefCd,
          status: station.status,
          color: getStatusColor(station.status)
        }
      }))
    }
  }, [stations, filterPref, filterLine, filterStatus])

  // 路線色マッチ式
  const lineColorMatch = useMemo(() => {
    if (lineColors.length === 0) return null
    const matchArray: any[] = ['match', ['get', 'name:ja']]
    const seen = new Set<string>()
    lineColors.forEach(lc => {
      if (!seen.has(lc.name)) { seen.add(lc.name); matchArray.push(lc.name, lc.color || '#bbb') }
      const short = lc.name.replace(/^(東京メトロ|都営|JR|京王|京急|京成|小田急|東急|西武|東武|相鉄|横浜市営)/, '')
      if (short !== lc.name && !seen.has(short)) { seen.add(short); matchArray.push(short, lc.color || '#bbb') }
    })
    matchArray.push('#bbb')
    return matchArray
  }, [lineColors])

  const clusterLayer: LayerProps = {
    id: 'clusters', type: 'circle', source: 'stations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#334155', 50, '#1e293b', 200, '#0f172a'],
      'circle-radius': ['step', ['get', 'point_count'], 15, 50, 20, 200, 25],
      'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
    }
  }

  const clusterCountLayer: LayerProps = {
    id: 'cluster-count', type: 'symbol', source: 'stations',
    filter: ['has', 'point_count'],
    layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
    paint: { 'text-color': '#ffffff' }
  }

  const unclusteredPointLayer: LayerProps = {
    id: 'unclustered-point', type: 'circle', source: 'stations',
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
  }

  const activeFilterCount = [filterPref !== 'ALL', filterLine !== 'ALL', filterStatus !== 'ALL'].filter(Boolean).length

  return (
    <div className="h-full w-full relative bg-slate-50">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm font-medium animate-pulse">日本全国の駅を読み込み中...</p>
          </div>
        </div>
      )}

      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="https://tile.openstreetmap.jp/styles/osm-bright/style.json"
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onClick={event => {
          const feature = event.features?.[0]
          if (!feature) return
          if (feature.layer.id === 'unclustered-point') {
            const p = feature.properties
            if (p) {
              const coords = (feature.geometry as any).coordinates
              const st = stations.find(s => s.id === p.id)
              const station = st ? { ...st, lat: coords[1], lng: coords[0] } : {
                id: p.id, name: p.name, prefCd: p.prefCd,
                lat: coords[1], lng: coords[0],
                status: p.status as StationStatus, lineIds: []
              }
              setSelectedStation(station)
              setVisitHistory([]) // リセット
              // 履歴を非同期で取得
              getStationVisitHistory(p.id).then(h => setVisitHistory(h))
              setViewState(prev => ({ ...prev, longitude: coords[0], latitude: coords[1], zoom: Math.max(prev.zoom, 13) }))
            }
          }
        }}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* 路線レイヤー: beforeId="poi-railway" で駅クラスターより必ず下に描画 */}
        {lineColorMatch && (
          <Layer
            id="railway-osm"
            type="line"
            source="openmaptiles"
            source-layer="transportation"
            beforeId="poi-railway"
            filter={['==', 'class', 'rail']}
            paint={{
              'line-color': lineColorMatch as any,
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 3, 16, 5],
              'line-opacity': 0.8
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        )}

        <Source id="stations" type="geojson" data={geojson as any} cluster={true} clusterMaxZoom={12} clusterRadius={50}>
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredPointLayer} />
        </Source>
      </Map>

      {/* フィルタリングパネル */}
      <div className="absolute top-4 left-4 z-10 w-56 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-100 overflow-hidden">
        {/* ヘッダー */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
        >
          <span className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            絞り込み
            {activeFilterCount > 0 && (
              <span className="bg-primary text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
            {/* ステータスフィルタ */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pt-3">ステータス</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterStatus(opt.value)}
                    className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border-2 transition-all text-center ${filterStatus === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 都道府県フィルタ */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">都道府県</p>
              <select
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                value={filterPref}
                onChange={e => setFilterPref(e.target.value)}
              >
                <option value="ALL">日本全国</option>
                {Object.entries(PREF_NAMES).map(([cd, name]) => (
                  <option key={cd} value={cd}>{name}</option>
                ))}
              </select>
            </div>

            {/* 路線フィルタ */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">路線</p>
              <select
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none"
                value={filterLine}
                onChange={e => setFilterLine(e.target.value)}
              >
                <option value="ALL">すべての路線</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id.toString()}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* リセット */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterPref('ALL'); setFilterLine('ALL'); setFilterStatus('ALL') }}
                className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 py-1 transition-colors"
              >
                フィルタをリセット
              </button>
            )}
          </div>
        )}

        {/* 区切り線と一括記録ボタン */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3">
          <Button
            onClick={() => setShowLineBulkRecorder(true)}
            className="w-full bg-slate-900 text-white rounded-xl py-4 h-auto flex items-center justify-center gap-2 text-sm"
          >
            <Route className="w-4 h-4" /> 路線別まとめて記録
          </Button>

          <Button
            onClick={() => setShowRouteRecorder(true)}
            className="w-full bg-white text-slate-700 border border-slate-200 rounded-xl py-3 h-auto flex items-center justify-center gap-2 text-xs font-black hover:bg-slate-50"
          >
            <Route className="w-3.5 h-3.5" /> ルート一括記録
          </Button>

          {/* 凡例 */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48] shrink-0" /> 乗車・下車済み
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] shrink-0" /> 通過のみ
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8] shrink-0" /> 未訪問
            </div>
          </div>
        </div>
      </div>

      {/* ルート記録モーダル */}
      {showRouteRecorder && (
        <RouteRecorder onClose={() => setShowRouteRecorder(false)} onComplete={refreshStationStatuses} />
      )}

      {/* 路線別一括記録モーダル */}
      {showLineBulkRecorder && (
        <LineBulkRecorder onClose={() => setShowLineBulkRecorder(false)} onComplete={refreshStationStatuses} />
      )}

      {/* 駅詳細パネル */}
      {selectedStation && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm md:left-auto md:right-6 md:translate-x-0 z-20 bg-[#fdfcf9] rounded-2xl shadow-2xl border-2 border-[#e5e1da] overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white border-b-8 border-primary p-6 relative">
            <button
              onClick={() => setSelectedStation(null)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <div className="text-center space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{PREF_NAMES[selectedStation.prefCd]}</p>
              <h2 className="text-4xl font-black text-slate-800 tracking-tighter">{selectedStation.name}</h2>
              <p className="text-[10px] text-slate-300 font-mono">STATION ID: {selectedStation.id}</p>
            </div>
            {selectedStation.status !== 'UNVISITED' && (
              <div className="absolute -bottom-4 -left-2 rotate-[-12deg] pointer-events-none select-none">
                <div className="relative flex items-center justify-center w-24 h-24">
                  <div className={`absolute inset-0 border-4 border-double rounded-full opacity-60 ${(selectedStation.status === 'ALIGHT' || selectedStation.status === 'BOARD') ? 'border-[#e11d48]' : 'border-[#fbbf24]'}`} />
                  <span className={`font-black text-xl opacity-60 ${(selectedStation.status === 'ALIGHT' || selectedStation.status === 'BOARD') ? 'text-[#e11d48]' : 'text-[#fbbf24]'}`}>
                    {(selectedStation.status === 'ALIGHT' || selectedStation.status === 'BOARD') ? '乗下車' : '通過'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 space-y-5 overflow-y-auto max-h-80">
            <form
              className="space-y-4"
              action={async (formData) => {
                setIsSaving(true)
                try {
                  formData.append('stationId', selectedStation.id.toString())
                  await saveVisitLog(formData)
                  const data = await getStations()
                  cachedStations = data as Station[]
                  setStations(cachedStations)
                  const newStatus = formData.get('status') as StationStatus
                  setSelectedStation(prev => prev ? { ...prev, status: newStatus } : null)
                } catch (e: any) {
                  alert(e.message || 'エラーが発生しました')
                } finally {
                  setIsSaving(false)
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">記録タイプ</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="relative">
                    <input type="radio" name="status" value="ALIGHT" defaultChecked={selectedStation.status === 'ALIGHT' || selectedStation.status === 'BOARD'} className="sr-only peer" />
                    <div className="text-xs font-bold py-2 border-2 border-slate-100 rounded-xl text-slate-500 text-center cursor-pointer transition-all hover:border-slate-200 peer-checked:bg-[#e11d48] peer-checked:text-white peer-checked:border-[#e11d48]">
                      乗車・下車
                    </div>
                  </label>
                  <label className="relative">
                    <input type="radio" name="status" value="PASS" defaultChecked={selectedStation.status === 'PASS'} className="sr-only peer" />
                    <div className="text-xs font-bold py-2 border-2 border-slate-100 rounded-xl text-slate-500 text-center cursor-pointer transition-all hover:border-slate-200 peer-checked:bg-[#fbbf24] peer-checked:text-white peer-checked:border-[#fbbf24]">
                      通過
                    </div>
                  </label>
                  <label className="relative">
                    <input type="radio" name="status" value="UNVISITED" defaultChecked={selectedStation.status === 'UNVISITED'} className="sr-only peer" />
                    <div className="text-xs font-bold py-2 border-2 border-slate-100 rounded-xl text-slate-500 text-center cursor-pointer transition-all hover:border-slate-200 peer-checked:bg-slate-500 peer-checked:text-white peer-checked:border-slate-500">
                      未訪問
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> 訪問日
                </label>
                <input type="date" name="visitedAt" className="w-full bg-slate-50 border-2 border-slate-100 p-2 rounded-xl text-sm font-medium focus:outline-none focus:border-primary transition-all" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">駅の思い出メモ</label>
                <textarea name="memo" className="w-full bg-slate-50 border-2 border-slate-100 p-3 rounded-xl text-sm h-20 resize-none focus:outline-none focus:border-primary transition-all" placeholder="ここに記録を残せます..." />
              </div>

              <Button type="submit" disabled={isSaving} className="w-full py-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-base shadow-lg hover:shadow-xl active:scale-[0.98] transition-all">
                {isSaving ? '保存中...' : '記録を刻む'}
              </Button>
            </form>

            {/* 訪問履歴 */}
            {visitHistory.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 訪問履歴 ({visitHistory.length}件)
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {visitHistory.map(h => (
                    <div key={h.id} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl">
                      <span className={`shrink-0 mt-0.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
                        h.eventType === 'ALIGHT' || h.eventType === 'BOARD'
                          ? 'bg-[#e11d48]/10 text-[#e11d48]'
                          : 'bg-[#fbbf24]/10 text-[#d97706]'
                      }`}>
                        {h.eventType === 'ALIGHT' || h.eventType === 'BOARD' ? '乗下車' : '通過'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-600">
                          {new Date(h.visitedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                        {h.memo && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{h.memo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
