import { useEffect, useState } from 'react'
import {
  CONDITIONS, CONDITION_RECORDS, ConditionRecord, DesignCondition,
} from '@/model/conditions'
import { useOptionalDatabase } from '@/lib/db/provider'
import { getConditions, getConditionRecords } from '@/lib/db/queries'

// Loads seeded conditions from SQLite, falling back to the hardcoded CONDITIONS
// (used in tests, before the DB is seeded, or when the DB is unavailable on web).
export function useConditions(): DesignCondition[] {
  const [conditions, setConditions] = useState<DesignCondition[]>([])
  const db = useOptionalDatabase()

  useEffect(() => {
    if (!db) {
      setConditions(CONDITIONS)
      return
    }
    getConditions(db)
      .then(setConditions)
      .catch(() => setConditions(CONDITIONS))
  }, [db])

  return conditions.length > 0 ? conditions : CONDITIONS
}

// Loads a condition's attached records from SQLite, falling back to the
// hardcoded CONDITION_RECORDS map.
export function useConditionRecords(condId: string | null | undefined): ConditionRecord[] {
  const [records, setRecords] = useState<ConditionRecord[]>([])
  const db = useOptionalDatabase()

  useEffect(() => {
    if (!condId) {
      setRecords([])
      return
    }
    if (!db) {
      setRecords(CONDITION_RECORDS[condId] ?? [])
      return
    }
    getConditionRecords(db, condId)
      .then((rows) => setRecords(rows.length > 0 ? rows : (CONDITION_RECORDS[condId] ?? [])))
      .catch(() => setRecords(CONDITION_RECORDS[condId] ?? []))
  }, [db, condId])

  return records
}
