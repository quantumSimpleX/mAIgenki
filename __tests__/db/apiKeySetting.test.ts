// OpenRouter API key persistence. The key is stored under the settings key
// `openrouter_api_key` in the IndexedDB settings store, via the same
// getIndexedSetting/putIndexedSetting used by the upload prompt and the
// SettingsSheet. Validates the round-trip and the overwrite path.

import 'fake-indexeddb/auto'
import { openIndexedDb, getIndexedSetting, putIndexedSetting } from '@/lib/db/indexedDb'

describe('openrouter_api_key setting', () => {
  it('round-trips a stored key', async () => {
    const db = await openIndexedDb(`maigenki-apikey-${Date.now()}`)

    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBeNull()

    await putIndexedSetting(db, 'openrouter_api_key', 'sk-or-abc123')
    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBe('sk-or-abc123')
    db.close()
  })

  it('overwrites and can be cleared', async () => {
    const db = await openIndexedDb(`maigenki-apikey-${Date.now()}`)

    await putIndexedSetting(db, 'openrouter_api_key', 'sk-or-first')
    await putIndexedSetting(db, 'openrouter_api_key', 'sk-or-second')
    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBe('sk-or-second')

    await putIndexedSetting(db, 'openrouter_api_key', '')
    expect(await getIndexedSetting(db, 'openrouter_api_key')).toBe('')
    db.close()
  })
})
