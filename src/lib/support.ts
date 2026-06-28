// Shared presentation helpers: evidence parsing, log-scale time-rail mapping,
// and date/age label formatting. Pure functions — safe to unit-test.

const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

const MONTH_IDX: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

// Log-scale steepness constant (from handoff). Larger K = more compression of
// older years toward the bottom of the rail.
export const RAIL_K = 2.5

export type ParsedEvidence = {
  doctor: string
  institution: string
  location: string
}

// 'Dr. Sarah Kim · Bay Area Skin & Allergy Institute · Oakland, CA, US'
//   → { doctor, institution, location }
export function parseEvidence(ev: string): ParsedEvidence {
  const parts = ev.split(' · ').map((p) => p.trim())
  return {
    doctor: parts[0] ?? '',
    institution: parts[1] ?? '',
    location: parts[2] ?? '',
  }
}

// Map a year onto a 0..1 rail position. 0 = oldest (minYear), 1 = newest (maxYear).
export function toRailPos(
  yearFrac: number,
  minYear: number,
  maxYear: number,
  K: number = RAIL_K,
): number {
  if (maxYear <= minYear) return 0
  const t = Math.max(0, Math.min(1, (yearFrac - minYear) / (maxYear - minYear)))
  return (Math.exp(K * t) - 1) / (Math.exp(K) - 1)
}

// Inverse of toRailPos: map a 0..1 rail position back to a year.
export function fromRailPos(
  pos: number,
  minYear: number,
  maxYear: number,
  K: number = RAIL_K,
): number {
  const clamped = Math.max(0, Math.min(1, pos))
  const t = Math.log(clamped * (Math.exp(K) - 1) + 1) / K
  return minYear + t * (maxYear - minYear)
}

// date mode → 'YYYY-MMM'; age mode → 'AGE N.N' (never negative).
export function formatDateDisplay(
  yearFrac: number,
  mode: 'date' | 'age',
  birthYear: number,
  birthMonth: string,
): string {
  if (mode === 'age') {
    const birthFrac = birthYear + (MONTH_IDX[birthMonth] ?? 0) / 12
    const age = Math.max(0, yearFrac - birthFrac)
    return `AGE ${age.toFixed(1)}`
  }
  const yr = Math.floor(yearFrac)
  const monthIdx = Math.max(0, Math.min(11, Math.round((yearFrac - yr) * 12)))
  return `${yr}-${MONTHS_SHORT[monthIdx]}`
}
