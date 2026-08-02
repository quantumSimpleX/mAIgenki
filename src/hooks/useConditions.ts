import { useCallback, useEffect, useState } from 'react'
import {
  CONDITIONS, CONDITION_RECORDS, ConditionRecord, DesignCondition,
} from '@/model/conditions'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import {
 getIndexedConditions, getConditionRecords, getIndexedConditionDots, hasIndexedUserRecords,
  type ConditionRecordEntry, type IndexedConditionDot,
} from '@/lib/db/indexedDb'
import { useAppStore, type ConditionSource } from '@/store/useAppStore'

// Fallback dot list built from the hardcoded CONDITIONS (single, primary
// location per condition) — mirrors the shape getIndexedConditionDots returns.
function conditionsToDots(conditions: DesignCondition[]): IndexedConditionDot[] {
  return conditions.map((c) => ({
    conditionId: c.id, locationId: null, system: c.system, cx_percent: c.cx_percent, cy_percent: c.cy_percent,
    yearFrac: c.yearFrac, status: c.status ?? 'documented',
  }))
}

// Design-layer read: maps the raw IndexedDB record_records shape onto the
// ConditionRecord shape the body-map records carousel renders (mirrors what
// queries.ts's SQLite getConditionRecords used to do inline).
function toConditionRecord(r: ConditionRecordEntry): ConditionRecord {
  return {
    id: r.id,
    type: r.record_type as ConditionRecord['type'],
    label: r.title ?? '',
    date: r.date ?? '',
    color: r.color ?? '#FFFFFF',
    imageId: r.image_id,
  }
}

// Loads seeded conditions from IndexedDB, falling back to the hardcoded
// CONDITIONS (used in tests, before the DB is seeded, or when the DB is
// unavailable on web). IndexedDB is the sole persistence layer — see
// CLAUDE.md/AGENTS.md.
export function useConditions(sourceOverride?: ConditionSource): [
  DesignCondition[],
  () => void,
  (id: string, cxPercent: number, cyPercent: number) => void,
] {
  // Seed initial state with the hardcoded fallback so no state is ever empty —
  // this also avoids a synchronous setState when the DB is unavailable.
  const [conditions, setConditions] = useState<DesignCondition[]>(CONDITIONS)
  const db = useOptionalIndexedDb()
  const conditionSource = useAppStore((s) => s.conditionSource)
  const effectiveSource = sourceOverride ?? conditionSource

  const refresh = useCallback(() => {
    if (!db) {
      if (effectiveSource === 'auto') console.warn('[health-pipeline] bodymap-load-skipped', { reason: 'database-unavailable' })
      return // initial/current state already holds the fallback
    }
    const startedAt = Date.now()
    if (effectiveSource === 'auto') console.info('[health-pipeline] bodymap-load-started')
    getIndexedConditions(db, effectiveSource)
 .then(async (rows) => {
 const hasUserRecords = rows.length === 0 && effectiveSource === 'auto'
 ? await hasIndexedUserRecords(db)
 : false
        if (effectiveSource === 'auto') console.info('[health-pipeline] bodymap-load-completed', {
          rows: rows.length,
 usedFallback: rows.length === 0 && !hasUserRecords,
          durationMs: Date.now() - startedAt,
        })
 setConditions(rows.length > 0 || hasUserRecords ? rows : CONDITIONS)
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

// Loads the flattened multi-location dot list (one entry per condition
// *location*, not per condition) from IndexedDB, falling back to the
// hardcoded CONDITIONS (single dot each). Mirrors useConditions()'s pattern —
// state seeded with a safe fallback, DB-access hook + effect — but returns a
// [dots, refresh] tuple (rather than a bare array) so callers can re-fetch
// after a relocation or upload, same as useConditions()'s own refresh.
export function useConditionDots(sourceOverride?: ConditionSource): [IndexedConditionDot[], () => Promise<void>] {
  const [dots, setDots] = useState<IndexedConditionDot[]>(() => conditionsToDots(CONDITIONS))
  const db = useOptionalIndexedDb()
  const conditionSource = useAppStore((s) => s.conditionSource)
  const effectiveSource = sourceOverride ?? conditionSource

  // Returns the in-flight promise (rather than firing-and-forgetting) so
  // callers that need to know the refreshed dots have actually landed in
  // state before proceeding — e.g. re-enabling a "Done" button only once a
  // deletion's effect on the dot count is visible — can await it. The setDots
  // calls stay inside the .then()/.catch() callbacks (not the top level of an
  // async refresh function) so this reads the same to the set-state-in-effect
  // lint rule as before this function became awaitable.
  const refresh = useCallback((): Promise<void> => {
    if (!db) return Promise.resolve() // initial/current state already holds the fallback
    return getIndexedConditionDots(db, effectiveSource)
      .then(async (rows) => {
        const hasUserRecords = rows.length === 0 && effectiveSource === 'auto'
          ? await hasIndexedUserRecords(db)
          : false
        setDots(rows.length > 0 || hasUserRecords ? rows : conditionsToDots(CONDITIONS))
      })
      .catch(() => setDots(conditionsToDots(CONDITIONS)))
  }, [db, effectiveSource])

  useEffect(() => { refresh() }, [refresh, effectiveSource])

  return [dots, refresh]
}

// Loads a condition's attached records from IndexedDB, falling back to the
// hardcoded CONDITION_RECORDS map.
export function useConditionRecords(condId: string | null | undefined): ConditionRecord[] {
  // Only DB-loaded rows live in state; the hardcoded fallback and the empty/no-id
  // cases are derived during render, so the effect never setStates synchronously.
  // `id` tags which condition the loaded rows belong to, guarding against showing
  // stale rows after condId changes.
  const [loaded, setLoaded] = useState<{ id: string; rows: ConditionRecord[] } | null>(null)
  const db = useOptionalIndexedDb()

  useEffect(() => {
    if (!condId || !db) return
    let cancelled = false
    getConditionRecords(db, condId)
      .then((rows) => { if (!cancelled) setLoaded({ id: condId, rows: rows.map(toConditionRecord) }) })
      .catch(() => { if (!cancelled) setLoaded({ id: condId, rows: [] }) })
    return () => { cancelled = true }
  }, [db, condId])

  if (!condId) return []
  if (loaded && loaded.id === condId && loaded.rows.length > 0) return loaded.rows
  return CONDITION_RECORDS[condId] ?? []
}
