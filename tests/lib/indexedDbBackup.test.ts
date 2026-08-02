import 'fake-indexeddb/auto'
import {
  openIndexedDb, seedIndexedDbDemoData, getIndexedConditionDots, putRecordImage, getRecordImageBlob,
  putIndexedMeasurement, putIndexedProvider, getProvidersForRecord,
} from '@/lib/db/indexedDb'
import {
  buildIndexedDbBackup, restoreIndexedDbBackup, exportIndexedDbBackupToJson, importIndexedDbBackupFromJson,
} from '@/lib/db/indexedDbBackup'
import { CONDITIONS } from '@/model/conditions'

describe('IndexedDB backup adapter', () => {
  it('round-trips seeded conditions and locations', async () => {
    const db = await openIndexedDb(`maigenki-backup-${Date.now()}`)
    await seedIndexedDbDemoData(db)
    const backup = await buildIndexedDbBackup(db)
    db.transaction('conditions', 'readwrite').objectStore('conditions').clear()
    await restoreIndexedDbBackup(db, backup)

    const dots = await getIndexedConditionDots(db)
    expect(dots).toHaveLength(CONDITIONS.length + 5) // stones +1, rotator +1, fractures +3 secondary locations
    const stonesDots = dots.filter((d) => d.conditionId === 'stones')
    expect(stonesDots).toEqual([
      expect.objectContaining({ conditionId: 'stones', cx_percent: 40.32, cy_percent: 37.12 }),
      expect.objectContaining({ conditionId: 'stones', cx_percent: 48.32, cy_percent: 37.12 }),
    ])
    db.close()
  })

  // Task 2.11: JSON export/import with a record_images row. Byte-level Blob
  // fidelity through a *live* IndexedDB read is NOT provable in this project's
  // Jest environment: fake-indexeddb clones every stored value via Node's
  // structuredClone(), which silently fails to clone a Blob under this
  // project's testEnvironment (VM-context isolation) — a Blob written via
  // put() already comes back as `{}` from get()/getAll(), independent of this
  // export/import code (see tests/lib/_spike02-indexeddb-blob.test.ts,
  // recorded on the p00 card). Byte-level fidelity of the base64 codec itself
  // is already covered by tests/lib/blob.test.ts's pure round-trip (no
  // IndexedDB involved). What's provable — and tested here — is that the
  // export/import path doesn't crash or drop a record_images row when one is
  // present, and that its non-Blob fields survive the round trip. Full
  // Blob fidelity through a real IndexedDB store must be confirmed in a real
  // browser (see the card's Task 2.14 notes), not asserted here.
  it('round-trips a record_images row (non-Blob fields) through JSON export/import', async () => {
    const db = await openIndexedDb(`maigenki-backup-blob-${Date.now()}`)
    await putRecordImage(db, {
      id: 'img-1',
      record_id: 'rec-1',
      page_number: 1,
      source_file: 'test.png',
      title: 'Test image',
      mime_type: 'image/png',
      width: 2,
      height: 2,
      byte_size: 8,
      image_blob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
      thumbnail_blob: null,
      date: null,
      notes: null,
      created_at: new Date().toISOString(),
    })

    const json = await exportIndexedDbBackupToJson(db)
    const parsed = JSON.parse(json) as { stores: { record_images: { id: string; title: string; mime_type: string }[] } }
    expect(parsed.stores.record_images).toHaveLength(1)
    expect(parsed.stores.record_images[0]).toEqual(expect.objectContaining({
      id: 'img-1', title: 'Test image', mime_type: 'image/png', source_file: 'test.png',
    }))

    await importIndexedDbBackupFromJson(db, json)
    const restored = await getRecordImageBlob(db, 'img-1')
    expect(restored).not.toBeNull()
    expect(restored!.mimeType).toBe('image/png')

    db.close()
  })

  // Regression for a Codex review finding on PR #1: the `measurements` store
  // was missing from INDEXED_DB_BACKUP_STORES, so export/import silently
  // dropped all lab/vital history. `providers` (added alongside the new
  // providers store) is covered the same way.
  it('round-trips measurements and providers through a backup', async () => {
    const db = await openIndexedDb(`maigenki-backup-measurements-${Date.now()}`)
    await putIndexedMeasurement(db, {
      id: 'm-1', record_id: 'rec-1', name: 'Blood pressure', value_numeric: 145, unit: 'mmHg',
      date: '2022-06-01', inferred_fields: null,
    })
    await putIndexedProvider(db, {
      id: 'p-1', record_id: 'rec-1', name: 'Dr. Kim', specialty: null, email: null, phone: null, evidence: 'seen by Dr. Kim',
    })

    const backup = await buildIndexedDbBackup(db)
    db.transaction('measurements', 'readwrite').objectStore('measurements').clear()
    db.transaction('providers', 'readwrite').objectStore('providers').clear()
    await restoreIndexedDbBackup(db, backup)

    const measurementsTx = db.transaction('measurements', 'readonly')
    const measurements = await new Promise<unknown[]>((resolve, reject) => {
      const req = measurementsTx.objectStore('measurements').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(measurements).toHaveLength(1)

    const providers = await getProvidersForRecord(db, 'rec-1')
    expect(providers).toHaveLength(1)
    expect(providers[0].name).toBe('Dr. Kim')

    db.close()
  })

  it('rejects an invalid backup envelope before writing', async () => {
    const db = await openIndexedDb(`maigenki-backup-invalid-${Date.now()}`)
    await expect(restoreIndexedDbBackup(db, {
      app: 'other' as 'maigenki',
      formatVersion: 1,
      database: db.name,
      exportedAt: new Date().toISOString(),
      stores: {},
    })).rejects.toThrow(/mAIgenki IndexedDB backup/)
    db.close()
  })
})
