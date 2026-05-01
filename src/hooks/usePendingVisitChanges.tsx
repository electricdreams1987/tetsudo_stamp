'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { savePendingVisitChanges } from '@/app/map/actions'

export type PendingEventType = 'BOARD' | 'ALIGHT' | 'VISITED' | 'PASS' | 'UNVISITED'

export type PendingVisitChange = {
  stationId: number
  lineId?: number
  eventType: PendingEventType
  visitedAt?: string
  memo?: string
  tripTitle?: string
  sourceType: 'route' | 'line'
}

type SaveStatus = 'idle' | 'success' | 'error'

const changeKey = (change: Pick<PendingVisitChange, 'stationId' | 'lineId' | 'sourceType'>) =>
  `${change.sourceType}:${change.lineId ?? 'none'}:${change.stationId}`

export function usePendingVisitChanges(storageKey: string, onSaved?: () => Promise<void> | void) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingVisitChange>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const saved = window.localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  useEffect(() => {
    try {
      if (Object.keys(pendingChanges).length === 0) window.localStorage.removeItem(storageKey)
      else window.localStorage.setItem(storageKey, JSON.stringify(pendingChanges))
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }, [pendingChanges, storageKey])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pendingChanges).length === 0) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingChanges])

  const changes = useMemo(() => Object.values(pendingChanges), [pendingChanges])

  const upsertChange = useCallback((change: PendingVisitChange) => {
    setSaveStatus('idle')
    setPendingChanges(prev => ({
      ...prev,
      [changeKey(change)]: change,
    }))
  }, [])

  const upsertChanges = useCallback((changesToAdd: PendingVisitChange[]) => {
    setSaveStatus('idle')
    setPendingChanges(prev => {
      const next = { ...prev }
      changesToAdd.forEach(change => {
        next[changeKey(change)] = change
      })
      return next
    })
  }, [])

  const clearChanges = useCallback(() => {
    setSaveStatus('idle')
    setPendingChanges({})
  }, [])

  const saveChanges = useCallback(async () => {
    if (changes.length === 0 || isSaving) return

    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await savePendingVisitChanges(changes)
      setPendingChanges({})
      setSaveStatus('success')
      await onSaved?.()
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }, [changes, isSaving, onSaved])

  return {
    pendingChanges,
    changes,
    pendingCount: changes.length,
    isSaving,
    saveStatus,
    upsertChange,
    upsertChanges,
    clearChanges,
    saveChanges,
  }
}

export function PendingChangesBar({
  count,
  isSaving,
  saveStatus,
  onSave,
  onDiscard,
  saveLabel = '保存',
}: {
  count: number
  isSaving: boolean
  saveStatus: SaveStatus
  onSave: () => void
  onDiscard: () => void
  saveLabel?: string
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[110] border-t bg-white/95 p-3 backdrop-blur md:absolute">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">未保存</p>
          <p className="text-sm font-black text-slate-900">{count}件</p>
          {saveStatus === 'success' && <p className="text-xs font-bold text-emerald-600">保存しました</p>}
          {saveStatus === 'error' && <p className="text-xs font-bold text-red-600">保存に失敗しました。再試行してください</p>}
        </div>
        <button
          type="button"
          onClick={onDiscard}
          disabled={count === 0 || isSaving}
          className="flex h-12 items-center gap-1.5 rounded-lg border px-3 text-xs font-black text-slate-600 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> 変更を破棄
        </button>
        <Button
          type="button"
          onClick={onSave}
          disabled={count === 0 || isSaving}
          className="h-12 rounded-lg bg-slate-900 px-5 font-black text-white disabled:opacity-40"
        >
          {isSaving ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 保存中...</span>
          ) : (
            <span className="flex items-center gap-2"><Check className="h-4 w-4" /> {saveLabel}</span>
          )}
        </Button>
      </div>
    </div>
  )
}
