import { useEffect, useRef, useState } from 'react'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { getIndexedSetting as getSetting, putIndexedSetting as upsertSetting } from '@/lib/db/indexedDb'
import { useAppStore } from '@/store/useAppStore'
import { useConditions } from '@/hooks/useConditions'
import { SupportedLang } from '@/model/conditions'
import { inferBodyType } from '@/lib/inference/bodyType'

const LANGS: SupportedLang[] = ['en', 'zh-TW', 'ja', 'es']
const CONDITION_SOURCES = ['auto', 'demo'] as const

// Loads user settings (preferred language + date of birth) from the IndexedDB
// settings store on startup and writes them back whenever they change, so they
// persist across sessions. On web, when the DB is unavailable, this is a no-op
// and the store keeps its in-memory defaults.
export function useSettingsPersistence(): void {
  const db = useOptionalIndexedDb()
  const [conditions] = useConditions()
  const preferredLanguage = useAppStore((s) => s.preferredLanguage)
  const birthYear = useAppStore((s) => s.birthYear)
  const birthMonth = useAppStore((s) => s.birthMonth)
  const gender = useAppStore((s) => s.gender)
  const conditionSource = useAppStore((s) => s.conditionSource)
  const setPreferredLanguage = useAppStore((s) => s.setPreferredLanguage)
  const setBirthYear = useAppStore((s) => s.setBirthYear)
  const setBirthMonth = useAppStore((s) => s.setBirthMonth)
  const setGender = useAppStore((s) => s.setGender)
  const setConditionSource = useAppStore((s) => s.setConditionSource)
  const setGenderPromptNeeded = useAppStore((s) => s.setGenderPromptNeeded)

  // Gate writes until the initial load has applied, so defaults don't overwrite
  // stored values before they're read.
  const [hydrated, setHydrated] = useState(false)
  // Whether a gender was already resolved (stored or inferred), so inference
  // runs at most once and doesn't clobber a user/stored choice.
  const genderResolved = useRef(false)

  useEffect(() => {
    if (!db) return
    let cancelled = false
    void (async () => {
      try {
        const [lang, by, bm, g, source] = await Promise.all([
          getSetting(db, 'preferred_language'),
          getSetting(db, 'birth_year'),
          getSetting(db, 'birth_month'),
          getSetting(db, 'gender'),
          getSetting(db, 'condition_source'),
        ])
        if (cancelled) return
        if (lang && LANGS.includes(lang as SupportedLang)) setPreferredLanguage(lang as SupportedLang)
        const yr = by ? parseInt(by, 10) : NaN
        if (!Number.isNaN(yr)) setBirthYear(yr)
        if (bm) setBirthMonth(bm)
        if (g === 'male' || g === 'female') { setGender(g); genderResolved.current = true }
        if (source && CONDITION_SOURCES.includes(source as (typeof CONDITION_SOURCES)[number])) {
          setConditionSource(source as (typeof CONDITION_SOURCES)[number])
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [db, setPreferredLanguage, setBirthYear, setBirthMonth, setGender, setConditionSource])

  // Infer body type from the records when nothing was stored. A gendered signal
  // sets the gender directly; no signal raises a one-time prompt on the bodymap
  // rather than silently defaulting.
  useEffect(() => {
    if (!hydrated || genderResolved.current || conditions.length === 0) return
    genderResolved.current = true
    const inferred = inferBodyType(conditions)
    if (inferred === 'unknown') setGenderPromptNeeded(true)
    else setGender(inferred)
  }, [hydrated, conditions, setGender, setGenderPromptNeeded])

  useEffect(() => {
    if (db && hydrated) {
      upsertSetting(db, 'preferred_language', preferredLanguage).catch(() => {})
    }
  }, [db, hydrated, preferredLanguage])

  useEffect(() => {
    if (db && hydrated) {
      upsertSetting(db, 'birth_year', String(birthYear)).catch(() => {})
    }
  }, [db, hydrated, birthYear])

  useEffect(() => {
    if (db && hydrated) {
      upsertSetting(db, 'birth_month', birthMonth).catch(() => {})
    }
  }, [db, hydrated, birthMonth])

  useEffect(() => {
    if (db && hydrated) {
      upsertSetting(db, 'gender', gender).catch(() => {})
    }
  }, [db, hydrated, gender])

  useEffect(() => {
    if (db && hydrated) {
      upsertSetting(db, 'condition_source', conditionSource).catch(() => {})
    }
  }, [db, hydrated, conditionSource])
}

// Mount this near the root (inside DatabaseProvider) to activate persistence.
export function SettingsHydrator(): null {
  useSettingsPersistence()
  return null
}
