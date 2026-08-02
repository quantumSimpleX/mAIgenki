import { resolvePage, type RecordSection, type RecordStructure, type SectionType } from './structure'

// Pure, LLM-free chunking (Task 3.3): turns a RecordStructure (Task 3.2, whose
// section offsets are the LLM's best-effort guess) into TextChunks whose `text`
// is always an exact substring of the source `text` — offsets are re-anchored
// via heading-string search here, never trusted blindly from the LLM.

export type TextChunk = {
  sectionHeading: string
  sectionType: SectionType
  inferredDate: string | null
  pageStart: number | null
  pageEnd: number | null
  text: string
  // Propagated from RecordSection.imageWorthy (Task 3.2) so Task 4.3's
  // pipeline wiring can tell, per chunk, whether its originating section was
  // flagged for image capture — split/merged chunks inherit their parent
  // section's flag like they do sectionHeading/inferredDate.
  imageWorthy: boolean
}

const DEFAULT_MAX_CHARS_PER_CHUNK = 6000
const MIN_SECTION_CHARS = 200

type AnchoredSection = RecordSection & { startOffset: number; endOffset: number }

// Re-anchors each section's startOffset by searching for its heading string in
// the actual text (search cursor advances monotonically so repeated headings
// resolve to successive occurrences). Falls back to the LLM-reported offset
// (clamped into range) if the heading can't be found verbatim. Each section's
// endOffset is then fixed to exactly where the next section starts (or the end
// of the text for the last section), so sections are contiguous and slices
// never drift from the source.
function reanchorSections(text: string, sections: RecordSection[], pageBreaks: number[] | undefined): AnchoredSection[] {
  if (sections.length === 0) {
    return [{
      heading: '', startOffset: 0, endOffset: text.length, inferredDate: null,
      sectionType: 'other', imageWorthy: false,
      pageStart: resolvePage(0, pageBreaks), pageEnd: resolvePage(Math.max(0, text.length - 1), pageBreaks),
    }]
  }

  const anchored: AnchoredSection[] = []
  let cursor = 0
  for (const section of sections) {
    const found = section.heading ? text.indexOf(section.heading, cursor) : -1
    const start = found >= 0 ? found : Math.min(Math.max(section.startOffset, cursor), text.length)
    anchored.push({ ...section, startOffset: start, endOffset: start })
    cursor = found >= 0
      ? Math.min(text.length, found + Math.max(1, section.heading.length))
      : Math.min(text.length, start + 1)
  }

  // Text before the first heading is still part of the record. Keep it in
  // the first extraction chunk so diagnoses or measurements in the preamble
  // are not silently omitted.
  anchored[0].startOffset = 0

  for (let i = 0; i < anchored.length; i += 1) {
    anchored[i].endOffset = i + 1 < anchored.length ? anchored[i + 1].startOffset : text.length
  }

  // Re-resolve pageStart/pageEnd from the reanchored (verbatim-heading-search)
  // offsets, not the LLM's original approximate startOffset/endOffset — the
  // latter can land on the wrong page even when the heading search itself
  // correctly locates the real section.
  for (const section of anchored) {
    section.pageStart = resolvePage(section.startOffset, pageBreaks)
    section.pageEnd = resolvePage(Math.max(section.startOffset, section.endOffset - 1), pageBreaks)
  }

  // Degenerate sections (heading search collapsed two sections onto the same
  // offset) contribute no text — drop them rather than emit an empty chunk.
  const nonEmpty = anchored.filter((s) => s.endOffset > s.startOffset)
  return nonEmpty.length > 0 ? nonEmpty : [{ ...anchored[0], startOffset: 0, endOffset: text.length }]
}

// Sections under `minChars` merge into the following section (their text
// prepends into the neighbor's range) rather than becoming their own chunk. A
// tiny final section merges backward into the previous one instead, since
// there is no "next" section to absorb into.
function mergeTinySections(sections: AnchoredSection[], minChars: number): AnchoredSection[] {
  if (sections.length <= 1) return sections
  const merged: AnchoredSection[] = []
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    const length = section.endOffset - section.startOffset
    const isLast = i === sections.length - 1
    if (length < minChars && !isLast) {
      sections[i + 1] = mergeSectionMetadata(section, {
        ...sections[i + 1],
        startOffset: section.startOffset,
      })
      continue
    }
    if (length < minChars && isLast && merged.length > 0) {
      merged[merged.length - 1] = mergeSectionMetadata(merged[merged.length - 1], {
        ...section,
        endOffset: section.endOffset,
      })
      continue
    }
    merged.push(section)
  }
  return merged
}

function mergeSectionMetadata(first: AnchoredSection, second: AnchoredSection): AnchoredSection {
  const headings = [first.heading, second.heading]
    .filter((heading, index, all) => heading && all.indexOf(heading) === index)
  const pageStarts = [first.pageStart, second.pageStart].filter((page): page is number => page != null)
  const pageEnds = [first.pageEnd, second.pageEnd].filter((page): page is number => page != null)
  return {
    ...second,
    heading: headings.join(' / '),
    sectionType: first.sectionType !== 'other' ? first.sectionType : second.sectionType,
    inferredDate: first.inferredDate ?? second.inferredDate,
    imageWorthy: first.imageWorthy || second.imageWorthy,
    pageStart: pageStarts.length > 0 ? Math.min(...pageStarts) : null,
    pageEnd: pageEnds.length > 0 ? Math.max(...pageEnds) : null,
  }
}

function toChunk(section: AnchoredSection, sliceText: string): TextChunk {
  return {
    sectionHeading: section.heading,
    sectionType: section.sectionType,
    inferredDate: section.inferredDate,
    pageStart: section.pageStart,
    pageEnd: section.pageEnd,
    text: sliceText,
    imageWorthy: section.imageWorthy,
  }
}

// Splits an oversized section on paragraph boundaries (blank lines), so each
// sub-chunk still ends on a natural break where possible. Any single
// paragraph still over `maxChars` is hard-split with no attempt at a natural
// boundary — better than sending an unbounded chunk to the LLM. All slicing
// is done via `text.slice`, so every emitted chunk is an exact substring.
function splitOversized(text: string, section: AnchoredSection, maxChars: number): TextChunk[] {
  const sectionText = text.slice(section.startOffset, section.endOffset)
  const paragraphBreaks = /\n{2,}/g
  const boundaries = [0]
  let match: RegExpExecArray | null
  while ((match = paragraphBreaks.exec(sectionText))) boundaries.push(match.index + match[0].length)
  boundaries.push(sectionText.length)

  const chunks: TextChunk[] = []
  let chunkStart = 0
  let chunkEnd = 0
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const paragraphStart = boundaries[i]
    const paragraphEnd = boundaries[i + 1]
    if (paragraphEnd - chunkStart > maxChars && chunkEnd > chunkStart) {
      chunks.push(toChunk(section, sectionText.slice(chunkStart, chunkEnd)))
      chunkStart = paragraphStart
    }
    chunkEnd = paragraphEnd
  }
  if (chunkEnd > chunkStart) chunks.push(toChunk(section, sectionText.slice(chunkStart, chunkEnd)))

  return chunks.flatMap((chunk) => hardSplitIfNeeded(chunk, maxChars))
}

function hardSplitIfNeeded(chunk: TextChunk, maxChars: number): TextChunk[] {
  if (chunk.text.length <= maxChars) return [chunk]
  const parts: TextChunk[] = []
  for (let i = 0; i < chunk.text.length; i += maxChars) {
    parts.push({ ...chunk, text: chunk.text.slice(i, i + maxChars) })
  }
  return parts
}

export function chunkRecordBySections(
  text: string,
  structure: RecordStructure,
  maxCharsPerChunk = DEFAULT_MAX_CHARS_PER_CHUNK,
  pageBreaks?: number[],
): TextChunk[] {
  const sections = mergeTinySections(reanchorSections(text, structure.sections, pageBreaks), MIN_SECTION_CHARS)
  const chunks: TextChunk[] = []
  for (const section of sections) {
    const length = section.endOffset - section.startOffset
    if (length <= maxCharsPerChunk) {
      chunks.push(toChunk(section, text.slice(section.startOffset, section.endOffset)))
    } else {
      chunks.push(...splitOversized(text, section, maxCharsPerChunk))
    }
  }
  return chunks
}
