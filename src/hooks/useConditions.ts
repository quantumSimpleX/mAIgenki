import { useEffect, useState } from 'react'
import { useSQLiteContext } from 'expo-sqlite'
import {
  CONDITIONS, CONDITION_RECORDS, ConditionRecord, DesignCondition,
} from '@/model/conditions'
import { getConditions, getConditionRecords } from '@/lib/db/queries'

// Loads seeded conditions from SQLite, falling back to the hardcoded CONDITIONS
// (used in tests / before the DB is seeded).
export function useConditions(): DesignCondition[] {
  const [conditions, setConditions] = useState<DesignCondition[]>([])
  const db = useSQLiteContext()

  useEffect(() => {
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
  const db = useSQLiteContext()

  useEffect(() => {
    if (!condId) {
      setRecords([])
      return
    }
    getConditionRecords(db, condId)
      .then((rows) => setRecords(rows.length > 0 ? rows : (CONDITION_RECORDS[condId] ?? [])))
      .catch(() => setRecords(CONDITION_RECORDS[condId] ?? []))
  }, [db, condId])

  return records
}
