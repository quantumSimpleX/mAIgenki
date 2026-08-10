import { callLLMWithFallback, type LLMTraceEvent } from './client'
import { STRUCTURE_PROMPT as EDITABLE_STRUCTURE_PROMPT } from './prompts'
import type { KeyStore, LMFProfile } from '@/lib/lmf'

// ── Types ─────────────────────────────────────────────────────────────────────

// Shared LLM-routing bag threaded through structure analysis (this file) and
// per-chunk extraction (enrich.ts) — one shape so pipeline.ts's existing
// object literal (db/profile/keys/timeoutMs/onTrace) satisfies both call sites
// unchanged.
export type EnrichRoutingOptions = {
  db?: IDBDatabase
  profile?: LMFProfile
  keys?: KeyStore
  timeoutMs?: number
  onTrace?: (event: LLMTraceEvent) => void
  waitForCooldown?: boolean
  // Task 3.1's per-page character offsets, threaded through from
  // pipeline.ts's extraction step so analyzeRecordStructure can resolve each
  // section's pageStart/pageEnd. Not a callLLMWithFallback option — enrich.ts
  // strips it out before spreading the rest of this bag into the LLM call.
  pageBreaks?: number[]
}

export type SectionType = 'visit' | 'problem_list' | 'labs' | 'imaging' | 'summary' | 'other'

export type RecordSection = {
  heading: string
  startOffset: number
  endOffset: number
  inferredDate: string | null
  sectionType: SectionType
  imageWorthy: boolean
  pageStart: number | null
  pageEnd: number | null
}

export type RecordStructure = {
  organization: 'chronological' | 'problem_based' | 'mixed'
  sections: RecordSection[]
}

// Raw LLM response shape, before pageStart/pageEnd are resolved against
// pageBreaks (the LLM has no reliable notion of page numbers from raw text).
type RawSection = {
  heading: string
  startOffset: number
  endOffset: number
  inferredDate: string | null
  sectionType: SectionType
  imageWorthy: boolean
}

type RawStructure = {
  organization: 'chronological' | 'problem_based' | 'mixed'
  sections: RawSection[]
}

const SECTION_TYPES: SectionType[] = ['visit', 'problem_list', 'labs', 'imaging', 'summary', 'other']
const ORGANIZATIONS = ['chronological', 'problem_based', 'mixed']

// ── Prompt ────────────────────────────────────────────────────────────────────

// ── Validate callback ─────────────────────────────────────────────────────────

function parseStructure(content: string): RawStructure | null {
  try {
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (
      typeof parsed.organization !== 'string' ||
      !ORGANIZATIONS.includes(parsed.organization) ||
      !Array.isArray(parsed.sections)
    ) {
      return null
    }
    const sections: RawSection[] = []
    for (const raw of parsed.sections as Record<string, unknown>[]) {
      if (typeof raw.heading !== 'string' || typeof raw.startOffset !== 'number' || typeof raw.endOffset !== 'number') {
        return null
      }
      sections.push({
        heading: raw.heading,
        startOffset: raw.startOffset,
        endOffset: raw.endOffset,
        inferredDate: typeof raw.inferredDate === 'string' ? raw.inferredDate : null,
        sectionType: SECTION_TYPES.includes(raw.sectionType as SectionType) ? (raw.sectionType as SectionType) : 'other',
        imageWorthy: raw.imageWorthy === true,
      })
    }
    return { organization: parsed.organization as RawStructure['organization'], sections }
  } catch {
    return null
  }
}

// Resolves a character offset to a 1-based page number via `pageBreaks`
// (Task 3.1's per-page/estimated offsets) — the last page whose start is
// at or before `offset`.
export function resolvePage(offset: number, pageBreaks: number[] | undefined): number | null {
  if (!pageBreaks || pageBreaks.length === 0) return null
  let page = 1
  for (let i = 0; i < pageBreaks.length; i += 1) {
    if (offset >= pageBreaks[i]) page = i + 1
  }
  return page
}

function singleSectionFallback(text: string, pageBreaks: number[] | undefined): RecordStructure {
  return {
    organization: 'mixed',
    sections: [{
      heading: 'Full record',
      startOffset: 0,
      endOffset: text.length,
      inferredDate: null,
      sectionType: 'other',
      imageWorthy: false,
      pageStart: resolvePage(0, pageBreaks),
      pageEnd: resolvePage(Math.max(0, text.length - 1), pageBreaks),
    }],
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeRecordStructure(
  text: string,
  apiKey: string,
  models: string[],
  routing?: EnrichRoutingOptions,
  pageBreaks?: number[],
): Promise<RecordStructure> {
 const STRUCTURE_PROMPT = EDITABLE_STRUCTURE_PROMPT
  const result = await callLLMWithFallback<RawStructure>({
    messages: [
      { role: 'system', content: STRUCTURE_PROMPT },
      { role: 'user', content: `Segment this complete medical record:\n\n${text}` },
    ],
    apiKey,
    models,
    temperature: 0,
    label: 'structure-analysis',
    validate: parseStructure,
    ...routing,
  })

  // Resilience fallback, not an error path: every model in the chain failing
  // must not abort the whole pipeline — treat the record as one chunk instead.
  if (!result.ok || !result.value) {
    return singleSectionFallback(text, pageBreaks)
  }

  const sections: RecordSection[] = result.value.sections.map((section) => ({
    ...section,
    pageStart: resolvePage(section.startOffset, pageBreaks),
    pageEnd: resolvePage(Math.max(section.startOffset, section.endOffset - 1), pageBreaks),
  }))

  if (sections.length === 0) return singleSectionFallback(text, pageBreaks)

  return { organization: result.value.organization, sections }
}
