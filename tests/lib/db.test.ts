import {
  initDatabase,
  findOrCreateFacility,
  findOrCreateProvider,
  insertHealthRecord,
  insertCondition,
  insertConditionProvider,
  insertMeasurement,
  insertMedication,
  upsertSetting,
  getSetting,
  getConditionsByDateRange,
} from '@/lib/db/queries'

// ── Mock expo-sqlite ────────────────────────────────────────────────────────

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
}

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}))

beforeEach(() => jest.clearAllMocks())

// ── initDatabase ─────────────────────────────────────────────────────────────

describe('initDatabase', () => {
  it('creates legacy and real-world clinical relationship tables', async () => {
    await initDatabase(mockDb as any)
    const sql: string = mockDb.execAsync.mock.calls[0][0]
    const tables = [
      'facilities',
      'providers',
      'facility_relationships',
      'provider_facility_roles',
      'health_records',
      'conditions',
      'condition_providers',
      'evidence_sources',
      'clinical_events',
      'clinical_event_providers',
      'clinical_event_conditions',
      'clinical_event_measurements',
      'clinical_event_medications',
      'clinical_event_evidence',
      'measurements',
      'medications',
      'settings',
    ]
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })
})

// ── facilities ───────────────────────────────────────────────────────────────

describe('findOrCreateFacility', () => {
  it('returns existing id when facility name already exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 'fac-1', name: 'Mass General' })
    const id = await findOrCreateFacility(mockDb as any, { name: 'Mass General', city: 'Boston', state: 'MA', country: 'US' })
    expect(id).toBe('fac-1')
    expect(mockDb.runAsync).not.toHaveBeenCalled()
  })

  it('inserts and returns new id when facility does not exist', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null)
    const id = await findOrCreateFacility(mockDb as any, { name: 'Beth Israel', city: 'Boston', state: 'MA', country: 'US' })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO facilities'),
      expect.arrayContaining(['Beth Israel', 'Boston', 'MA', 'US']),
    )
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

// ── providers ────────────────────────────────────────────────────────────────

describe('findOrCreateProvider', () => {
  it('returns existing id when provider name + specialty already exists', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ id: 'prov-1' })
    const id = await findOrCreateProvider(mockDb as any, { name: 'Dr. Lee', specialty: 'Gastroenterology' })
    expect(id).toBe('prov-1')
    expect(mockDb.runAsync).not.toHaveBeenCalled()
  })

  it('inserts new provider and links to primary facility', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null)
    const id = await findOrCreateProvider(mockDb as any, {
      name: 'Dr. Smith', specialty: 'Cardiology', primaryFacilityId: 'fac-1',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO providers'),
      expect.arrayContaining(['Dr. Smith', 'Cardiology', 'fac-1']),
    )
    expect(typeof id).toBe('string')
  })
})

// ── health_records ───────────────────────────────────────────────────────────

describe('insertHealthRecord', () => {
  it('inserts a record and returns its id', async () => {
    const id = await insertHealthRecord(mockDb as any, {
      filename: 'checkup-2023.pdf',
      fileHash: 'abc123',
      recordType: 'checkup',
      recordDate: '2023-06-01',
      pageCount: 4,
      extractionMethod: 'text',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO health_records'),
      expect.arrayContaining(['checkup-2023.pdf', 'abc123', 'checkup']),
    )
    expect(typeof id).toBe('string')
  })
})

// ── conditions ───────────────────────────────────────────────────────────────

describe('insertCondition', () => {
  it('inserts a condition with full anatomical hierarchy', async () => {
    const id = await insertCondition(mockDb as any, {
      recordId: 'rec-1',
      nameMedical: "Barrett's Esophagus",
      nameCommon: "Barrett's Esophagus",
      icdCode: 'K22.70',
      system: 'digestive',
      organ: 'esophagus',
      tissue: 'columnar epithelium',
      cellType: 'goblet cells',
      anatomicalLocation: 'gastroesophageal junction',
      anatomicalRegion: 'distal',
      laterality: null,
      renderX: 0.50,
      renderY: 0.42,
      status: 'documented',
      severity: 'mild',
      chronicity: 'chronic',
      certainty: 'confirmed',
      dateDiagnosed: '2022-03-15',
      evidence: 'Endoscopy confirmed columnar metaplasia at GEJ',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conditions'),
      expect.arrayContaining(["Barrett's Esophagus", 'gastroesophageal junction', 0.50, 0.42]),
    )
    expect(typeof id).toBe('string')
  })

  it('inserts an inferred condition (no explicit diagnosis date)', async () => {
    const id = await insertCondition(mockDb as any, {
      nameMedical: 'Hypertension',
      nameCommon: 'High Blood Pressure',
      system: 'cardiovascular',
      organ: 'heart',
      status: 'inferred',
      certainty: 'suspected',
      evidence: 'BP 145/92 on three consecutive visits',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO conditions'),
      expect.arrayContaining(['inferred', 'suspected']),
    )
    expect(typeof id).toBe('string')
  })
})

// ── condition_providers ───────────────────────────────────────────────────────

describe('insertConditionProvider', () => {
  it('links a condition to its PCP and specialist', async () => {
    await insertConditionProvider(mockDb as any, {
      conditionId: 'cond-1', providerId: 'prov-1', role: 'primary_care', facilityId: 'fac-1',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT.*condition_providers/),
      expect.arrayContaining(['cond-1', 'prov-1', 'primary_care', 'fac-1']),
    )
  })
})

// ── measurements ─────────────────────────────────────────────────────────────

describe('insertMeasurement', () => {
  it('inserts a lab value with its observed value, unit, and date', async () => {
    await insertMeasurement(mockDb as any, {
      recordId: 'rec-1',
      name: 'HbA1c',
      valueNumeric: 7.2,
      valueText: '7.2%',
      unit: '%',
      date: '2023-06-01',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO measurements'),
      expect.arrayContaining(['HbA1c', 7.2, '%', '2023-06-01']),
    )
  })
})

// ── medications ───────────────────────────────────────────────────────────────

describe('insertMedication', () => {
  it('inserts a prescription linked to a condition', async () => {
    await insertMedication(mockDb as any, {
      recordId: 'rec-1',
      conditionId: 'cond-1',
      name: 'Pantoprazole',
      genericName: 'pantoprazole sodium',
      dosage: '40mg',
      frequency: 'once daily',
      route: 'oral',
      datePrescribed: '2022-03-15',
    })
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO medications'),
      expect.arrayContaining(['Pantoprazole', '40mg', 'once daily', 'oral']),
    )
  })
})

// ── settings ─────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('upserts a setting', async () => {
    await upsertSetting(mockDb as any, 'body_type', 'female')
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO settings'),
      ['body_type', 'female'],
    )
  })

  it('gets a setting value', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: 'female' })
    const value = await getSetting(mockDb as any, 'body_type')
    expect(value).toBe('female')
  })

  it('returns null for missing setting', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null)
    const value = await getSetting(mockDb as any, 'nonexistent')
    expect(value).toBeNull()
  })
})

// ── getConditionsByDateRange ─────────────────────────────────────────────────

describe('getConditionsByDateRange', () => {
  it('queries conditions up to a given date', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 'c1', name_medical: "Barrett's Esophagus", date_diagnosed: '2022-03-15', render_x: 0.5, render_y: 0.42 },
    ])
    const results = await getConditionsByDateRange(mockDb as any, '2020-01-01', '2023-12-31')
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('WHERE'),
      expect.arrayContaining(['2020-01-01', '2023-12-31']),
    )
    expect(results).toHaveLength(1)
    expect(results[0].name_medical).toBe("Barrett's Esophagus")
  })
})
