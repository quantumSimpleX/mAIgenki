import { useEffect, useRef, useState } from 'react'
import { useOptionalDatabase } from '@/lib/db/provider'
import { getSetting, upsertSetting } from '@/lib/db/queries'
import { useAppStore, Gender } from '@/store/useAppStore'
import { useConditions } from '@/hooks/useConditions'
import { DesignCondition, SupportedLang } from '@/model/conditions'

const LANGS: SupportedLang[] = ['en', 'zh-TW', 'ja', 'es']

// Best-effort gender inference from the documented conditions, used as the
// default until the user explicitly sets it. Sex-specific diagnoses are the
// signal; defaults to 'female' when there's no clear indicator.
export function inferGenderFromConditions(conds: DesignCondition[]): Gender {
  const text = conds.map((c) => `${c.id} ${c.label} ${c.medName}`.toLowerCase()).join(' ')
  if (/prostat|testicular|\bbph\b/.test(text)) return 'male'
  if (/ovar|uter|cervi|pcos|fibroid|menstr|pregnan|endometr/.test(text)) return 'female'
  return 'female'
}

// Loads user settings (preferred language + date of birth) from the SQLite
// settings table on startup and writes them back whenever they change, so they
// persist across sessions. On web, when the DB is unavailable, this is a no-op
// and the store keeps its in-memory defaults.
export function useSettingsPersistence(): void {
  const db = useOptionalDatabase()
  const [conditions] = useConditions()
  const preferredLanguage = useAppStore((s) => s.preferredLanguage)
  const birthYear = useAppStore((s) => s.birthYear)
  const birthMonth = useAppStore((s) => s.birthMonth)
  const gender = useAppStore((s) => s.gender)
  const setPreferredLanguage = useAppStore((s) => s.setPreferredLanguage)
  const setBirthYear = useAppStore((s) => s.setBirthYear)
  const setBirthMonth = useAppStore((s) => s.setBirthMonth)
  const setGender = useAppStore((s) => s.setGender)

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
        const [lang, by, bm, g] = await Promise.all([
          getSetting(db, 'preferred_language'),
          getSetting(db, 'birth_year'),
          getSetting(db, 'birth_month'),
          getSetting(db, 'gender'),
        ])
        if (cancelled) return
        if (lang && LANGS.includes(lang as SupportedLang)) setPreferredLanguage(lang as SupportedLang)
        const yr = by ? parseInt(by, 10) : NaN
        if (!Number.isNaN(yr)) setBirthYear(yr)
        if (bm) setBirthMonth(bm)
        if (g === 'male' || g === 'female') { setGender(g); genderResolved.current = true }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [db, setPreferredLanguage, setBirthYear, setBirthMonth, setGender])

  // Infer gender from the records when nothing was stored.
  useEffect(() => {
    if (!hydrated || genderResolved.current || conditions.length === 0) return
    genderResolved.current = true
    setGender(inferGenderFromConditions(conditions))
  }, [hydrated, conditions, setGender])

  useEffect(() => {
    if (db && hydrated) upsertSetting(db, 'preferred_language', preferredLanguage).catch(() => {})
  }, [db, hydrated, preferredLanguage])

  useEffect(() => {
    if (db && hydrated) upsertSetting(db, 'birth_year', String(birthYear)).catch(() => {})
  }, [db, hydrated, birthYear])

  useEffect(() => {
    if (db && hydrated) upsertSetting(db, 'birth_month', birthMonth).catch(() => {})
  }, [db, hydrated, birthMonth])

  useEffect(() => {
    if (db && hydrated) upsertSetting(db, 'gender', gender).catch(() => {})
  }, [db, hydrated, gender])
}

// Mount this near the root (inside DatabaseProvider) to activate persistence.
export function SettingsHydrator(): null {
  useSettingsPersistence()
  return null
}
