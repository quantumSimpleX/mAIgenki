import { useCallback, useEffect, useState } from 'react'
import {
  CONDITIONS, CONDITION_RECORDS, ConditionRecord, DesignCondition,
} from '@/model/conditions'
import { useOptionalDatabase } from '@/lib/db/provider'
import { getConditions, getConditionRecords } from '@/lib/db/queries'
import { useAppStore, type ConditionSource } from '@/store/useAppStore'

// Loads seeded conditions from SQLite, falling back to the hardcoded CONDITIONS
// (used in tests, before the DB is seeded, or when the DB is unavailable on web).
export function useConditions(sourceOverride?: ConditionSource): [
  DesignCondition[],
  () => void,
  (id: string, cxPercent: number, cyPercent: number) => void,
] {
  // Seed initial state with the hardcoded fallback so no state is ever empty —
  // this also avoids a synchronous setState when the DB is unavailable.
  const [conditions, setConditions] = useState<DesignCondition[]>(CONDITIONS)
  const db = useOptionalDatabase()
  const conditionSource = useAppStore((s) => s.conditionSource)
  const effectiveSource = sourceOverride ?? conditionSource

  const refresh = useCallback(() => {
    if (!db) {
      if (effectiveSource === 'auto') console.warn('[health-pipeline] bodymap-load-skipped', { reason: 'database-unavailable' })
      return // initial/current state already holds the fallback
    }
    const startedAt = Date.now()
    if (effectiveSource === 'auto') console.info('[health-pipeline] bodymap-load-started')
    getConditions(db, effectiveSource)
      .then((rows) => {
        if (effectiveSource === 'auto') console.info('[health-pipeline] bodymap-load-completed', {
          rows: rows.length,
          usedFallback: rows.length === 0,
          durationMs: Date.now() - startedAt,
        })
        setConditions(rows.length > 0 ? rows : CONDITIONS)
      })
      .catch((error: unknown) => {
        if (effectiveSource === 'auto') console.error('[health-pipeline] bodymap-load-failed', {
          message: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        })
        setConditions(CONDITIONS)
      })
  }, [db, effectiveSource])

  const updatePosition = useCallback((id: string, cxPercent: number, cyPercent: number) => {
    setConditions((current) => current.map((condition) => (
      condition.id === id
        ? { ...condition, cx_percent: cxPercent, cy_percent: cyPercent }
        : condition
    )))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return [conditions, refresh, updatePosition]
}

// Loads a condition's attached records from SQLite, falling back to the
// hardcoded CONDITION_RECORDS map.
export function useConditionRecords(condId: string | null | undefined): ConditionRecord[] {
  // Only DB-loaded rows live in state; the hardcoded fallback and the empty/no-id
  // cases are derived during render, so the effect never setStates synchronously.
  // `id` tags which condition the loaded rows belong to, guarding against showing
  // stale rows after condId changes.
  const [loaded, setLoaded] = useState<{ id: string; rows: ConditionRecord[] } | null>(null)
  const db = useOptionalDatabase()

  useEffect(() => {
    if (!condId || !db) return
    let cancelled = false
    getConditionRecords(db, condId)
      .then((rows) => { if (!cancelled) setLoaded({ id: condId, rows }) })
      .catch(() => { if (!cancelled) setLoaded({ id: condId, rows: [] }) })
    return () => { cancelled = true }
  }, [db, condId])

  if (!condId) return []
  if (loaded && loaded.id === condId && loaded.rows.length > 0) return loaded.rows
  return CONDITION_RECORDS[condId] ?? []
}
