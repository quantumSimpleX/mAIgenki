import {
  ALL_SYSTEMS, CONDITIONS, CONDITION_RECORDS, SYSTEM_META,
  parseDateFrac, getLocalName, normalizeSystemId, defaultConditionPosition,
} from '@/model/conditions'

const htn = CONDITIONS.find((c) => c.id === 'htn')!

describe('parseDateFrac', () => {
  it('maps an early-year date to ≈ the year', () => {
    expect(parseDateFrac('2013-JAN-01')).toBeCloseTo(2013.0, 1)
  })
  it('maps a mid-year date to the middle of the year', () => {
    const v = parseDateFrac('2019-JUL-01')
    expect(v).toBeGreaterThan(2019.45)
    expect(v).toBeLessThan(2019.55)
  })
  it('maps a late-year date past .9', () => {
    expect(parseDateFrac('2023-DEC-31')).toBeGreaterThan(2023.9)
  })
  it('maps LLM numeric dates', () => {
    expect(parseDateFrac('2026-07-07')).toBeGreaterThan(2026.5)
    expect(parseDateFrac('2026-07-07')).toBeLessThan(2026.6)
  })
})

describe('LLM condition mapping', () => {
  it('normalizes shorthand system ids to bodymap ids', () => {
    expect(normalizeSystemId('cardio')).toBe('cardiovascular')
    expect(normalizeSystemId('gi')).toBe('digestive')
    expect(normalizeSystemId('endo')).toBe('endocrine')
    expect(normalizeSystemId('pulm')).toBe('respiratory')
  })
  it('returns visible default positions for non-demo rows', () => {
    const pos = defaultConditionPosition('cardiovascular', 'Essential hypertension')
    expect(pos.cx).toBeGreaterThan(0)
    expect(pos.cy).toBeGreaterThan(0)
  })
})

describe('CONDITIONS data', () => {
  it('has the complete demo condition set', () => {
    expect(CONDITIONS.length).toBe(23)
  })
  it('every system id is valid', () => {
    for (const c of CONDITIONS) expect(ALL_SYSTEMS).toContain(c.system)
  })
  it('cardio label is Cardiovascular (not Circulatory)', () => {
    expect(SYSTEM_META.cardiovascular.label).toBe('Cardiovascular')
  })
  it('has 11 systems', () => {
    expect(ALL_SYSTEMS.length).toBe(11)
  })
  it('every evidence string matches the doctor format', () => {
    const re = /^Dr\. .+ · .+ · .+, .+, US$/
    for (const c of CONDITIONS) expect(c.evidence).toMatch(re)
  })
})

describe('getLocalName', () => {
  it('returns Japanese name', () => {
    expect(getLocalName(htn, 'ja')).toBe('高血圧症')
  })
  it('returns Spanish name', () => {
    expect(getLocalName(htn, 'es')).toBe('Hipertensión arterial')
  })
  it('returns the English label for en', () => {
    expect(getLocalName(htn, 'en')).toBe(htn.label)
  })
  it('falls back to the localName for zh-TW', () => {
    expect(getLocalName(htn, 'zh-TW')).toBe(htn.localNames['zh-TW'] ?? htn.label)
  })
})

describe('CONDITION_RECORDS', () => {
  const VALID = new Set(['TREND', 'ECG', 'IMAGING', 'LABS', 'SPIRO', 'SCAN'])
  it('has an entry for all condition ids', () => {
    for (const c of CONDITIONS) expect(CONDITION_RECORDS[c.id]).toBeDefined()
  })
  it('every record type is valid', () => {
    for (const recs of Object.values(CONDITION_RECORDS)) {
      for (const r of recs) expect(VALID.has(r.type)).toBe(true)
    }
  })
  it('htn has 3 records', () => {
    expect(CONDITION_RECORDS.htn.length).toBe(3)
  })
  it('htn record color matches the cardio color', () => {
    for (const r of CONDITION_RECORDS.htn) expect(r.color).toBe('#EF4444')
  })
})
