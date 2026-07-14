import { buildBackup, restoreBackup, BACKUP_TABLES, type BackupFile } from '@/lib/db/backup'

// ── Mock expo-sqlite ────────────────────────────────────────────────────────

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
}

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}))

beforeEach(() => jest.clearAllMocks())

function makeBackup(settingsRows: unknown[]): BackupFile {
  const tables: Record<string, unknown[]> = {}
  for (const t of BACKUP_TABLES) tables[t] = t === 'settings' ? settingsRows : []
  return { app: 'maigenki', formatVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', tables }
}

// ── buildBackup (export) ────────────────────────────────────────────────────

describe('buildBackup', () => {
  it('omits secret settings keys from the exported backup', async () => {
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes('FROM settings')) {
        return Promise.resolve([
          { key: 'openrouter_api_key', value: 'sk-secret-123' },
          { key: 'lmf.key.openrouter', value: 'sk-secret-456' },
          { key: 'body_type', value: 'female' },
        ])
      }
      return Promise.resolve([])
    })

    const backup = await buildBackup(mockDb as any)

    const settingsKeys = backup.tables.settings!.map((r: any) => r.key)
    expect(settingsKeys).not.toContain('openrouter_api_key')
    expect(settingsKeys).not.toContain('lmf.key.openrouter')
    expect(settingsKeys).toContain('body_type')
  })
})

// ── restoreBackup (import) ──────────────────────────────────────────────────

describe('restoreBackup', () => {
  it('does not insert a secret setting key from a crafted backup', async () => {
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA table_info(settings)')) {
        return Promise.resolve([{ name: 'key' }, { name: 'value' }])
      }
      return Promise.resolve([])
    })

    const backup = makeBackup([
      { key: 'openrouter_api_key', value: 'sk-malicious' },
      { key: 'body_type', value: 'female' },
    ])

    await restoreBackup(mockDb as any, backup)

    const insertedKeys = mockDb.runAsync.mock.calls
      .filter(([sql]) => sql.includes('INSERT INTO settings'))
      .map(([, values]) => (values as unknown[])[0])
    expect(insertedKeys).not.toContain('openrouter_api_key')
    expect(insertedKeys).toContain('body_type')
  })

  it('round-trips non-secret settings intact', async () => {
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA table_info(settings)')) {
        return Promise.resolve([{ name: 'key' }, { name: 'value' }])
      }
      return Promise.resolve([])
    })

    const backup = makeBackup([{ key: 'body_type', value: 'male' }])

    await restoreBackup(mockDb as any, backup)

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settings'),
      ['body_type', 'male'],
    )
  })
})
