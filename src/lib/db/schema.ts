// Row types — shape of data as stored in SQLite (snake_case columns)

export type FacilityRow = {
  id: string
  name: string
  facility_type: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  created_at: string
}

export type ProviderRow = {
  id: string
  name: string
  specialty: string | null
  email: string | null
  phone: string | null
  primary_facility_id: string | null
  created_at: string
}

export type ProviderAffiliationRow = {
  id: string
  provider_id: string
  facility_id: string
  role: string | null
  evidence: string | null
  created_at: string
}

export type HealthRecordRow = {
  id: string
  filename: string
  file_hash: string | null
  record_type: string | null
  record_date: string | null
  page_count: number | null
  extraction_method: string | null
  facility_id: string | null
  uploaded_at: string
  processed_at: string | null
}

export type ConditionRow = {
  id: string
  record_id: string | null
  name_medical: string
  name_common: string | null
  icd_code: string | null
  system: string
  organ: string | null
  tissue: string | null
  cell_type: string | null
  anatomical_location: string | null
  anatomical_region: string | null
  laterality: string | null
  render_x: number | null
  render_y: number | null
  status: string
  severity: string | null
  chronicity: string | null
  certainty: string | null
  date_onset: string | null
  date_diagnosed: string | null
  date_resolved: string | null
  evidence: string | null
  notes: string | null
  created_at: string
}

export type ConditionProviderRow = {
  condition_id: string
  provider_id: string
  role: string
  facility_id: string | null
}

export type ConditionCareEventRow = {
  id: string
  condition_id: string
  provider_id: string
  facility_id: string | null
  event_type: string
  event_date: string
  evidence: string | null
  created_at: string
}

export type MeasurementRow = {
  id: string
  record_id: string | null
  name: string
  value_numeric: number | null
  value_text: string | null
  unit: string | null
  date: string
  provider_id: string | null
  facility_id: string | null
  evidence: string | null
  created_at: string
}

export type MedicationRow = {
  id: string
  record_id: string | null
  condition_id: string | null
  name: string
  generic_name: string | null
  dosage: string | null
  frequency: string | null
  route: string | null
  date_prescribed: string | null
  date_discontinued: string | null
  provider_id: string | null
  facility_id: string | null
  evidence: string | null
  created_at: string
}

export type ConditionLocalNameRow = {
  condition_id: string
  lang: string
  name: string
}

export type ConditionRecordRow = {
  id: string
  condition_id: string
  record_type: string
  title: string | null
  image_uri: string | null
  chart_json: string | null
  table_json: string | null
  date: string | null
  source_file: string | null
  notes: string | null
  created_at: string
}

export type SettingRow = {
  key: string
  value: string
}

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    facility_type TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT,
    email TEXT,
    phone TEXT,
    primary_facility_id TEXT REFERENCES facilities(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS provider_affiliations (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id),
    facility_id TEXT NOT NULL REFERENCES facilities(id),
    role TEXT,
    evidence TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(provider_id, facility_id)
  );

  CREATE TABLE IF NOT EXISTS health_records (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_hash TEXT,
    record_type TEXT,
    record_date TEXT,
    page_count INTEGER,
    extraction_method TEXT,
    facility_id TEXT REFERENCES facilities(id),
    uploaded_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS conditions (
    id TEXT PRIMARY KEY,
    record_id TEXT REFERENCES health_records(id),
    name_medical TEXT NOT NULL,
    name_common TEXT,
    icd_code TEXT,
    system TEXT NOT NULL,
    organ TEXT,
    tissue TEXT,
    cell_type TEXT,
    anatomical_location TEXT,
    anatomical_region TEXT,
    laterality TEXT,
    render_x REAL,
    render_y REAL,
    cx REAL,
    cy REAL,
    year_frac REAL,
    status TEXT NOT NULL DEFAULT 'documented',
    severity TEXT,
    chronicity TEXT,
    certainty TEXT DEFAULT 'confirmed',
    date_onset TEXT,
    date_diagnosed TEXT,
    date_resolved TEXT,
    evidence TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS condition_providers (
    condition_id TEXT NOT NULL REFERENCES conditions(id),
    provider_id TEXT NOT NULL REFERENCES providers(id),
    role TEXT NOT NULL,
    facility_id TEXT REFERENCES facilities(id),
    PRIMARY KEY (condition_id, provider_id, role)
  );

  CREATE TABLE IF NOT EXISTS condition_care_events (
    id TEXT PRIMARY KEY,
    condition_id TEXT NOT NULL REFERENCES conditions(id),
    provider_id TEXT NOT NULL REFERENCES providers(id),
    facility_id TEXT REFERENCES facilities(id),
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    evidence TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS measurements (
    id TEXT PRIMARY KEY,
    record_id TEXT REFERENCES health_records(id),
    name TEXT NOT NULL,
    value_numeric REAL,
    value_text TEXT,
    unit TEXT,
    date TEXT NOT NULL,
    provider_id TEXT REFERENCES providers(id),
    facility_id TEXT REFERENCES facilities(id),
    evidence TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    record_id TEXT REFERENCES health_records(id),
    condition_id TEXT REFERENCES conditions(id),
    name TEXT NOT NULL,
    generic_name TEXT,
    dosage TEXT,
    frequency TEXT,
    route TEXT,
    date_prescribed TEXT,
    date_discontinued TEXT,
    provider_id TEXT REFERENCES providers(id),
    facility_id TEXT REFERENCES facilities(id),
    evidence TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS condition_localnames (
    condition_id TEXT NOT NULL REFERENCES conditions(id),
    lang TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (condition_id, lang)
  );

  CREATE TABLE IF NOT EXISTS condition_records (
    id TEXT PRIMARY KEY,
    condition_id TEXT NOT NULL REFERENCES conditions(id),
    record_type TEXT NOT NULL,
    title TEXT,
    image_uri TEXT,
    chart_json TEXT,
    table_json TEXT,
    color TEXT,
    date TEXT,
    source_file TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

// SQLite has no `ADD COLUMN IF NOT EXISTS`. Each of these is run inside a
// try/catch on init so an already-migrated DB ignores the duplicate-column error.
export const ALTER_COLUMNS_SQL: string[] = [
  `ALTER TABLE providers ADD COLUMN email TEXT`,
  `ALTER TABLE providers ADD COLUMN phone TEXT`,
  `ALTER TABLE conditions ADD COLUMN evidence TEXT`,
  `ALTER TABLE conditions ADD COLUMN render_x REAL`,
  `ALTER TABLE conditions ADD COLUMN render_y REAL`,
  `ALTER TABLE conditions ADD COLUMN cx REAL`,
  `ALTER TABLE conditions ADD COLUMN cy REAL`,
  `ALTER TABLE conditions ADD COLUMN year_frac REAL`,
  `ALTER TABLE condition_records ADD COLUMN color TEXT`,
]
