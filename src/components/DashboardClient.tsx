'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react'
import { Globe, Info, ChevronDown, MapPin } from 'lucide-react'

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

const REGION_PREFS: Record<string, number[]> = {
  '北海道': [1],
  '東北': [2, 3, 4, 5, 6, 7],
  '関東': [8, 9, 10, 11, 12, 13, 14],
  '中部': [15, 16, 17, 18, 19, 20, 21, 22, 23],
  '近畿': [24, 25, 26, 27, 28, 29, 30],
  '中国': [31, 32, 33, 34, 35],
  '四国': [36, 37, 38, 39],
  '九州沖縄': [40, 41, 42, 43, 44, 45, 46, 47],
}

interface Props {
  overall: any
  prefStats: any[]
  regionStats: any[]
  includePass: boolean
}

export default function DashboardClient({ overall, prefStats, regionStats, includePass }: Props) {
  const [openRegion, setOpenRegion] = useState<string | null>(null)

  const prefMap = new Map(prefStats.map(p => [p.prefCd, p]))

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-8">

      {/* モード切替 */}
      <div className="flex justify-end">
        <div className="bg-slate-200 p-1 rounded-xl flex gap-0.5">
          <a
            href="/dashboard?includePass=true"
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${includePass ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            通過を含む
          </a>
          <a
            href="/dashboard?includePass=false"
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!includePass ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            乗車・下車のみ
          </a>
        </div>
      </div>

      {/* 全体統計 */}
      <section className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            {includePass ? 'OVERALL PROGRESS (WITH PASS)' : 'OVERALL PROGRESS (BOARD/ALIGHT ONLY)'}
          </h2>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <span className="text-7xl font-black">
                {overall.percentage.toFixed(1)}<span className="text-2xl ml-1">%</span>
              </span>
              <p className="text-slate-400 mt-2 font-medium">
                全 {overall.total.toLocaleString()} 駅中 {overall.visited.toLocaleString()} 駅を訪問
              </p>
            </div>
            <div className="flex-1 max-w-md w-full">
              <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden">
                <div className="bg-primary h-4 transition-all duration-1000 rounded-full" style={{ width: `${Math.min(overall.percentage, 100)}%` }} />
              </div>
            </div>
          </div>
          {!includePass && (
            <div className="mt-5 flex items-start gap-2 text-xs text-slate-400 bg-white/5 p-3 rounded-xl">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>「通過」を除外して、実際に「乗車・下車」した駅のみで計算しています。</span>
            </div>
          )}
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full -mr-32 -mt-32 pointer-events-none" />
      </section>

      {/* 地方・都道府県アコーディオン */}
      <section>
        <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
          <MapPin className="text-primary w-5 h-5" /> 地方・都道府県別
        </h2>
        <div className="space-y-2">
          {regionStats.map(r => {
            const isOpen = openRegion === r.name
            const regionPrefs = (REGION_PREFS[r.name] ?? [])
              .map(cd => prefMap.get(cd))
              .filter(Boolean)

            return (
              <div key={r.name} className="rounded-2xl overflow-hidden border-2 border-slate-100 bg-white shadow-sm transition-all">
                {/* 地方ヘッダー */}
                <button
                  onClick={() => setOpenRegion(isOpen ? null : r.name)}
                  className={`w-full text-left p-4 flex items-center gap-3 transition-colors hover:bg-slate-50 ${isOpen ? 'bg-primary/5 border-b-2 border-primary/10' : ''}`}
                >
                  {/* 進捗バー (縦) */}
                  <div className="w-1.5 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0">
                    <div
                      className="w-full bg-primary rounded-full transition-all duration-700"
                      style={{ height: `${r.percentage}%` }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-black text-base ${isOpen ? 'text-primary' : 'text-slate-800'}`}>
                        {r.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-400 font-bold">{r.visited}/{r.total}駅</span>
                        <span className={`text-base font-black ${isOpen ? 'text-primary' : 'text-slate-700'}`}>
                          {r.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-primary h-1.5 transition-all duration-700 rounded-full" style={{ width: `${r.percentage}%` }} />
                    </div>
                  </div>

                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                </button>

                {/* 都道府県グリッド（アコーディオン） */}
                {isOpen && (
                  <div className="p-4 bg-slate-50/80 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {regionPrefs.map((p: any) => (
                        <div
                          key={p.prefCd}
                          className="bg-white border border-slate-200 rounded-xl p-3 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <span className="text-xs font-bold text-slate-700 leading-tight">{PREF_NAMES[p.prefCd]}</span>
                            <span className="text-[11px] font-black text-primary ml-1 shrink-0">
                              {p.percentage.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                            <div className="bg-primary h-1 rounded-full" style={{ width: `${p.percentage}%` }} />
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1 font-bold">{p.visited}/{p.total}駅</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
