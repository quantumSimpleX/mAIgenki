// Task 2.14 — demo visual-parity regression test.
//
// Proves the IndexedDB-backed demo (post Task 2.13 cutover) renders the same
// condition dots, in the same positions, as the pre-cutover expo-sqlite-backed
// demo — automated, not a manual walkthrough, since both the SQLite seed path
// (seedDemoData) and the IndexedDB seed path (seedIndexedDbDemoData) are
// available side by side in this repo and can be seeded and compared directly
// against the same source-of-truth CONDITIONS array.
//
// What's compared: `getConditions` (SQLite, the function bodymap.tsx's
// useConditions() hook called before Task 2.13) vs `getIndexedConditions`
// (IndexedDB, what it calls now) — id, system, label, medName, date, yearFrac,
// cx_percent, cy_percent for every demo condition. This is
// exactly the data useConditions() feeds into GhostDots/BodySvg/ConditionRipples
// today (per-condition dots; the bilateral 'stones' second location is a
// condition_locations-only detail not yet consumed by rendering — see
// userDataTask.md Task 5.2/5.3, out of this phase's scope).

import 'fake-indexeddb/auto'
import { makeFakeDb } from '../db/fakeDb'
import { initDatabase, getConditions } from '@/lib/db/queries'
import { seedDemoData } from '@/lib/db/seed'
import { openIndexedDb, seedIndexedDbDemoData, getIndexedConditions } from '@/lib/db/indexedDb'
import { CONDITIONS, ALL_SYSTEMS } from '@/model/conditions'

describe('Demo visual parity — SQLite (pre-cutover) vs IndexedDB (post-cutover)', () => {
  it('renders the same demo conditions, in the same positions, on both backends', async () => {
    const sqliteDb = makeFakeDb()
    await initDatabase(sqliteDb)
    await seedDemoData(sqliteDb)
    const sqliteConditions = await getConditions(sqliteDb, 'demo')

    const idb = await openIndexedDb(`maigenki-parity-${Date.now()}`)
    await seedIndexedDbDemoData(idb)
    const indexedConditions = await getIndexedConditions(idb, 'demo')

    expect(sqliteConditions).toHaveLength(CONDITIONS.length)
    expect(indexedConditions).toHaveLength(CONDITIONS.length)

    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
    const sqliteById = byId(sqliteConditions)
    const indexedById = byId(indexedConditions)

    for (const c of CONDITIONS) {
      const sqliteRow = sqliteById.get(c.id)
      const indexedRow = indexedById.get(c.id)
      expect(sqliteRow).toBeDefined()
      expect(indexedRow).toBeDefined()
      expect(indexedRow!.system).toBe(sqliteRow!.system)
      expect(indexedRow!.label).toBe(sqliteRow!.label)
      expect(indexedRow!.medName).toBe(sqliteRow!.medName)
      expect(indexedRow!.date).toBe(sqliteRow!.date)
      expect(indexedRow!.yearFrac).toBeCloseTo(sqliteRow!.yearFrac, 6)
      expect(indexedRow!.cx_percent).toBeCloseTo(sqliteRow!.cx_percent, 6)
      expect(indexedRow!.cy_percent).toBeCloseTo(sqliteRow!.cy_percent, 6)
      // Both backends should also match the canonical source position exactly —
      // proves neither path silently recomputed a seeded/hashed fallback position.
      expect(indexedRow!.cx_percent).toBeCloseTo(c.cx_percent, 6)
      expect(indexedRow!.cy_percent).toBeCloseTo(c.cy_percent, 6)
    }

    idb.close()
  })

  it('covers all 11 organ systems reachable via activeSystems toggles, on both backends', async () => {
    const sqliteDb = makeFakeDb()
    await initDatabase(sqliteDb)
    await seedDemoData(sqliteDb)
    const sqliteConditions = await getConditions(sqliteDb, 'demo')

    const idb = await openIndexedDb(`maigenki-parity-systems-${Date.now()}`)
    await seedIndexedDbDemoData(idb)
    const indexedConditions = await getIndexedConditions(idb, 'demo')

    const sqliteSystems = new Set(sqliteConditions.map((c) => c.system))
    const indexedSystems = new Set(indexedConditions.map((c) => c.system))
    for (const system of ALL_SYSTEMS) {
      expect(sqliteSystems.has(system)).toBe(true)
      expect(indexedSystems.has(system)).toBe(true)
    }

    idb.close()
  })
})
