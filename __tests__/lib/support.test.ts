import {
  parseEvidence, toRailPos, fromRailPos, formatDateDisplay,
} from '@/lib/support'

describe('parseEvidence', () => {
  it('splits doctor / institution / location', () => {
    expect(parseEvidence('Dr. Sarah Kim · Bay Area Skin & Allergy Institute · Oakland, CA, US')).toEqual({
      doctor: 'Dr. Sarah Kim',
      institution: 'Bay Area Skin & Allergy Institute',
      location: 'Oakland, CA, US',
    })
  })
  it('handles an apostrophe in the institution', () => {
    expect(parseEvidence("Dr. Patrick Walsh · St. Mary's Medical Center · New York, NY, US")).toEqual({
      doctor: 'Dr. Patrick Walsh',
      institution: "St. Mary's Medical Center",
      location: 'New York, NY, US',
    })
  })
})

describe('toRailPos / fromRailPos', () => {
  it('min year ≈ 0', () => {
    expect(toRailPos(2013, 2013, 2024)).toBeCloseTo(0.0, 1)
  })
  it('max year ≈ 1', () => {
    expect(toRailPos(2024, 2013, 2024)).toBeCloseTo(1.0, 1)
  })
  it('is monotonic', () => {
    expect(toRailPos(2019, 2013, 2024)).toBeGreaterThan(toRailPos(2015, 2013, 2024))
  })
  it('fromRailPos inverts toRailPos', () => {
    const pos = toRailPos(2019, 2013, 2024)
    expect(fromRailPos(pos, 2013, 2024)).toBeCloseTo(2019, 1)
  })
})

describe('formatDateDisplay', () => {
  it('date mode → YYYY-MMM', () => {
    expect(formatDateDisplay(2019.78, 'date', 1985, 'JAN')).toMatch(/^\d{4}-[A-Z]{3}$/)
  })
  it('age mode → AGE N.N', () => {
    expect(formatDateDisplay(2019.78, 'age', 1985, 'JAN')).toMatch(/^AGE \d+\.\d$/)
  })
  it('age is never negative', () => {
    expect(formatDateDisplay(1980, 'age', 1985, 'JAN')).toBe('AGE 0.0')
  })
})
