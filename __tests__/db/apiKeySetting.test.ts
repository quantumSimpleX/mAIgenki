// Phase 9.8.5 — OpenRouter API key persistence. The key is stored under the
// settings key `openrouter_api_key` via the same getSetting/upsertSetting used
// by the upload prompt and the SettingsSheet. Validates the round-trip and the
// clear path against the shared in-memory fake DB.

import { initDatabase, getSetting, upsertSetting } from '@/lib/db/queries'
import { makeFakeDb } from './fakeDb'

describe('openrouter_api_key setting', () => {
  it('round-trips a stored key', async () => {
    const db = makeFakeDb()
    await initDatabase(db)

    expect(await getSetting(db, 'openrouter_api_key')).toBeNull()

    await upsertSetting(db, 'openrouter_api_key', 'sk-or-abc123')
    expect(await getSetting(db, 'openrouter_api_key')).toBe('sk-or-abc123')
  })

  it('overwrites and can be cleared', async () => {
    const db = makeFakeDb()
    await initDatabase(db)

    await upsertSetting(db, 'openrouter_api_key', 'sk-or-first')
    await upsertSetting(db, 'openrouter_api_key', 'sk-or-second')
    expect(await getSetting(db, 'openrouter_api_key')).toBe('sk-or-second')

    await upsertSetting(db, 'openrouter_api_key', '')
    expect(await getSetting(db, 'openrouter_api_key')).toBe('')
  })
})
