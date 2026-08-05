import type { ConditionInput } from './enrich'

/** Versioned, provider-neutral contract for whole-document extraction. */
export const LONGITUDINAL_SCHEMA_VERSION = 1

export type LongitudinalCondition = {
  name_medical: string
  name_common: string | null
  date_diagnosed: string | null
  date_onset: string | null
  status: ConditionInput['status']
  severity: string | null
  certainty: string | null
  evidence: string | null
  notes: string | null
  organ: string | null
  system: string | null
  anatomical_location: string | null
  locations: NonNullable<ConditionInput['locations']>
  provider: ConditionInput['provider']
  care_events: NonNullable<ConditionInput['care_events']>
  source_pages: number[]
  inferred_from_structure: string[]
}

export type LongitudinalExtraction = {
  schema_version: 1
  organization: 'chronological' | 'problem_based' | 'mixed'
  report_context: { providers: NonNullable<ConditionInput['provider']>[]; facilities: string[] }
  conditions: LongitudinalCondition[]
  measurements: Array<{ name: string; value_numeric: number; unit: string; date: string | null; inferred_from_structure: string[] }>
}

export function earliestDate(values: (string | null | undefined)[]): string | null {
  const valid = values.filter((value): value is string => Boolean(value && /^\d{4}(?:-\d{2}-\d{2})?$/.test(value)))
  return valid.sort()[0] ?? null
}

/** Date fraction is application-derived; the model never supplies this value. */
export function yearFrac(date: string | null): number {
  if (!date) return 0
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date)
  if (!match) return 0
  const year = Number(match[1])
  const month = Number(match[2] ?? 7)
  const day = Number(match[3] ?? 1)
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, month - 1, day)
  const end = Date.UTC(year + 1, 0, 1)
  return year + (current - start) / (end - start)
}

function key(condition: Pick<ConditionInput, 'name_medical' | 'system' | 'anatomical_location'>): string {
  return [condition.name_medical, condition.system, condition.anatomical_location]
    .map((value) => (value ?? '').trim().toLowerCase())
    .join('|')
}

/** Deterministically merges repeated longitudinal mentions without inventing fields. */
export function mergeLongitudinalConditions(conditions: ConditionInput[]): ConditionInput[] {
  const merged = new Map<string, ConditionInput>()
  for (const condition of conditions) {
    const previous = merged.get(key(condition))
    if (!previous) {
      merged.set(key(condition), { ...condition, date_diagnosed: earliestDate([condition.date_diagnosed, condition.date_onset]) })
      continue
    }
    merged.set(key(condition), {
      ...previous,
      name_common: previous.name_common ?? condition.name_common,
      organ: previous.organ ?? condition.organ,
      severity: previous.severity ?? condition.severity,
      certainty: previous.certainty ?? condition.certainty,
      date_diagnosed: earliestDate([previous.date_diagnosed, previous.date_onset, condition.date_diagnosed, condition.date_onset]),
      date_onset: earliestDate([previous.date_onset, condition.date_onset]),
      evidence: [previous.evidence, condition.evidence].filter(Boolean).join(' ') || null,
      notes: [previous.notes, condition.notes].filter(Boolean).join(' ') || null,
      provider: previous.provider ?? condition.provider,
      care_events: [...(previous.care_events ?? []), ...(condition.care_events ?? [])],
      locations: [...(previous.locations ?? []), ...(condition.locations ?? [])],
      inferred_from_structure: [...new Set([...(previous.inferred_from_structure ?? []), ...(condition.inferred_from_structure ?? [])])],
    })
  }
  return [...merged.values()]
}

export type AlphaMask = { width: number; height: number; alpha: Uint8Array | Uint8ClampedArray }

/** Decode a browser image asset into an alpha mask for authoritative coordinate validation. */
export async function loadAlphaMaskFromImageSource(source: string | HTMLImageElement): Promise<AlphaMask> {
  if (typeof document === 'undefined') throw new Error('Alpha-mask decoding requires a browser canvas')
  const image = typeof source === 'string' ? await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image()
    value.onload = () => resolve(value)
    value.onerror = () => reject(new Error('Unable to load anatomy mask asset'))
    value.src = source
  }) : source
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d')
  if (!context || canvas.width < 1 || canvas.height < 1) throw new Error('Unable to decode anatomy mask asset')
  context.drawImage(image, 0, 0)
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height)
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3]
  return { width: canvas.width, height: canvas.height, alpha }
}

export function isOpaquePixel(mask: AlphaMask, cx: number, cy: number): boolean {
  const x = Math.round((Math.max(0, Math.min(100, cx)) / 100) * (mask.width - 1))
  const y = Math.round((Math.max(0, Math.min(100, cy)) / 100) * (mask.height - 1))
  return mask.alpha[y * mask.width + x] > 0
}

/** Finds the closest opaque pixel; returns null when a mask has no valid pixels. */
export function repairPixelCoordinate(mask: AlphaMask, cx: number, cy: number): { cx: number; cy: number } | null {
  const clampedCx = Math.max(0, Math.min(100, cx))
  const clampedCy = Math.max(0, Math.min(100, cy))
  if (isOpaquePixel(mask, clampedCx, clampedCy)) return { cx: clampedCx, cy: clampedCy }
  const originX = Math.round((clampedCx / 100) * (mask.width - 1))
  const originY = Math.round((clampedCy / 100) * (mask.height - 1))
  const maxRadius = Math.max(mask.width, mask.height)
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let y = Math.max(0, originY - radius); y <= Math.min(mask.height - 1, originY + radius); y += 1) {
      for (let x = Math.max(0, originX - radius); x <= Math.min(mask.width - 1, originX + radius); x += 1) {
        if (mask.alpha[y * mask.width + x] > 0) return {
          cx: mask.width > 1 ? (x / (mask.width - 1)) * 100 : 0,
          cy: mask.height > 1 ? (y / (mask.height - 1)) * 100 : 0,
        }
      }
    }
  }
  return null
}

export function repairConditionCoordinates(mask: AlphaMask, condition: ConditionInput): ConditionInput {
  const repaired = condition.cx != null && condition.cy != null ? repairPixelCoordinate(mask, condition.cx, condition.cy) : null
  const locations = (condition.locations ?? []).map((location) => {
    if (location.cx == null || location.cy == null) return location
    const point = repairPixelCoordinate(mask, location.cx, location.cy)
    return point ? { ...location, ...point } : { ...location, cx: null, cy: null }
  })
  return { ...condition, ...(repaired ? repaired : condition.cx != null || condition.cy != null ? { cx: null, cy: null } : {}), locations }
}
