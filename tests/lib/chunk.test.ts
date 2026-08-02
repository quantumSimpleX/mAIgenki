import { chunkRecordBySections } from '@/lib/llm/chunk'
import type { RecordSection, RecordStructure } from '@/lib/llm/structure'

function section(overrides: Partial<RecordSection> & { heading: string }): RecordSection {
  return {
    startOffset: 0,
    endOffset: 0,
    inferredDate: null,
    sectionType: 'other',
    imageWorthy: false,
    pageStart: null,
    pageEnd: null,
    ...overrides,
  }
}

function structure(sections: RecordSection[]): RecordStructure {
  return { organization: 'mixed', sections }
}

// ── Exact-substring guarantee ─────────────────────────────────────────────────

describe('chunkRecordBySections — offset accuracy', () => {
  it('every chunk text is an exact substring of the source text, even with wrong LLM-reported offsets', () => {
    const text = 'Visit Note\nPatient seen for follow-up.\n\nLabs\nCBC normal. Glucose 95.\n\nSummary\nStable, continue current meds.'
    const s = structure([
      section({ heading: 'Visit Note', startOffset: 999, endOffset: 999, sectionType: 'visit' }),
      section({ heading: 'Labs', startOffset: 5, endOffset: 5, sectionType: 'labs' }),
      section({ heading: 'Summary', startOffset: 0, endOffset: 0, sectionType: 'summary' }),
    ])

    const chunks = chunkRecordBySections(text, s)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(text.indexOf(chunk.text)).toBeGreaterThanOrEqual(0)
    }
  })

  it('re-anchors via heading search and produces contiguous, gap-free chunks covering the whole text', () => {
    const text = 'Heading A\nfirst section text here.\n\nHeading B\nsecond section text here.'
    const s = structure([
      section({ heading: 'Heading A', startOffset: 0, endOffset: 0 }),
      section({ heading: 'Heading B', startOffset: 0, endOffset: 0 }),
    ])

    const chunks = chunkRecordBySections(text, s, 10_000)
    const joined = chunks.map((c) => c.text).join('')
    expect(joined).toBe(text)
  })

  it('single-section structure (structure-analysis fallback shape) yields one chunk spanning the whole text', () => {
    const text = 'Some unstructured record text with no headings at all.'
    const s = structure([section({ heading: 'Full record', startOffset: 0, endOffset: text.length })])

    const chunks = chunkRecordBySections(text, s)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(text)
  })
})

// ── Oversized-section splitting ───────────────────────────────────────────────

describe('chunkRecordBySections — oversized sections', () => {
  it('splits a section larger than maxCharsPerChunk into multiple sub-chunks', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: `.padEnd(30, 'x'))
    const text = `Long Section\n${paragraphs.join('\n\n')}`
    const s = structure([section({ heading: 'Long Section', startOffset: 0, endOffset: text.length })])

    const chunks = chunkRecordBySections(text, s, 80)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(80)
      expect(chunk.sectionHeading).toBe('Long Section')
    }
    // No content lost across the split — the pieces reconstruct the section.
    expect(chunks.map((c) => c.text).join('')).toBe(text)
  })

  it('hard-splits a single paragraph that alone exceeds maxCharsPerChunk', () => {
    const text = 'x'.repeat(500)
    const s = structure([section({ heading: '', startOffset: 0, endOffset: text.length })])

    const chunks = chunkRecordBySections(text, s, 100)
    expect(chunks.length).toBe(5)
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(100)
    expect(chunks.map((c) => c.text).join('')).toBe(text)
  })

  it('sections at or under maxCharsPerChunk are not split', () => {
    const text = 'Short Section\nJust a bit of text.'
    const s = structure([section({ heading: 'Short Section', startOffset: 0, endOffset: text.length })])

    const chunks = chunkRecordBySections(text, s, 10_000)
    expect(chunks).toHaveLength(1)
  })
})

// ── Tiny-section merging ──────────────────────────────────────────────────────

describe('chunkRecordBySections — tiny section merging', () => {
  it('merges a tiny section into the following section rather than emitting its own chunk', () => {
    const tinyHeading = 'X'
    const text = `${tinyHeading}\n\nMain Section\n${'body text here. '.repeat(30)}`
    const s = structure([
      section({ heading: tinyHeading, startOffset: 0, endOffset: 0 }),
      section({ heading: 'Main Section', startOffset: 0, endOffset: 0 }),
    ])

    const chunks = chunkRecordBySections(text, s, 10_000)
    // The tiny section (a few chars) is well under the 200-char minimum, so it
    // should be absorbed into the next section rather than becoming its own chunk.
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain(tinyHeading)
    expect(chunks[0].text).toContain('Main Section')
  })

  it('merges a tiny trailing section backward into the previous one', () => {
    const text = `Main Section\n${'body text here. '.repeat(30)}\n\nEnd`
    const s = structure([
      section({ heading: 'Main Section', startOffset: 0, endOffset: 0 }),
      section({ heading: 'End', startOffset: 0, endOffset: 0 }),
    ])

    const chunks = chunkRecordBySections(text, s, 10_000)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('End')
  })

  it('does not merge sections that already meet the minimum size', () => {
    const bodyA = 'A'.repeat(250)
    const bodyB = 'B'.repeat(250)
    const text = `Section One\n${bodyA}\n\nSection Two\n${bodyB}`
    const s = structure([
      section({ heading: 'Section One', startOffset: 0, endOffset: 0 }),
      section({ heading: 'Section Two', startOffset: 0, endOffset: 0 }),
    ])

    const chunks = chunkRecordBySections(text, s, 10_000)
    expect(chunks).toHaveLength(2)
  })
})
