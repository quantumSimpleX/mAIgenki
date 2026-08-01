import { Platform } from 'react-native'

// Minimum characters per page to be considered a text-based PDF.
// Below this threshold the PDF is treated as scanned (image-only pages).
export const MIN_CHARS_PER_PAGE = 50

export type ExtractionResult = {
  text: string
  pageCount: number
  // 'text' — embedded text extracted (fast, accurate)
  // 'ocr'  — scanned PDF detected; caller should surface a message to the user.
  //          Full on-device OCR is deferred (requires PDF-to-image rendering).
  method: 'text' | 'ocr'
  // Character offsets into `text` where each page begins (pageBreaks[0] === 0),
  // used by src/lib/llm/structure.ts to resolve a section's page range. See the
  // two call sites below for which strategy produced these — Task 0.3's spike
  // (doc.userDataFlow/kb4-DONE/p00-environment-spike.md) found per-page timing
  // unproven at scale, so any path that can't get real per-page offsets for
  // free falls back to an evenly-spaced estimate rather than paying extra cost
  // to compute exact ones. Optional at the type level (not just in practice)
  // so existing test fixtures across the repo that construct an
  // ExtractionResult without it (predating this field) keep typechecking —
  // callers that need it (src/lib/pipeline.ts) treat a missing value the same
  // as an empty array.
  pageBreaks?: number[]
  // Pages with no embedded text must still be retained when a mixed PDF also
  // contains enough text overall to proceed through the normal pipeline.
  imageOnlyPages?: number[]
}

// Even split of `textLength` across `pageCount` pages — used where the
// extraction source doesn't expose real per-page boundaries (see extractOnNative).
function estimatePageBreaks(textLength: number, pageCount: number): number[] {
  if (pageCount <= 0) return [0]
  return Array.from({ length: pageCount }, (_, i) => Math.round((textLength * i) / pageCount))
}

// Shared density check: too few characters per page ⇒ scanned/image-only PDF.
function classify(text: string, pageCount: number, pageBreaks: number[], pageCharCounts?: number[]): ExtractionResult {
  const charsPerPage = pageCount > 0 ? text.length / pageCount : 0
  const method: 'text' | 'ocr' = charsPerPage >= MIN_CHARS_PER_PAGE ? 'text' : 'ocr'
  const imageOnlyPages = pageCharCounts
    ?.map((count, index) => count === 0 ? index + 1 : null)
    .filter((page): page is number => page != null)
  return {
    text, pageCount, method, pageBreaks,
    ...(imageOnlyPages && imageOnlyPages.length > 0 ? { imageOnlyPages } : {}),
  }
}

export async function extractTextFromPDF(uri: string): Promise<ExtractionResult> {
  return Platform.OS === 'web' ? extractOnWeb(uri) : extractOnNative(uri)
}

// Native path — dynamic import keeps `expo-pdf-text-extract` (a native module that
// does not exist in web bundles) out of the module graph until it is actually run.
async function extractOnNative(uri: string): Promise<ExtractionResult> {
  const { extractTextWithInfo } = await import('expo-pdf-text-extract')
  const result = await extractTextWithInfo(uri)

  if (!result.success) {
    throw new Error(result.errorCode ?? result.error ?? 'PDF extraction failed')
  }

  // Native path: expo-pdf-text-extract returns the whole document's text as
  // one blob with no per-page boundary info, so real offsets aren't available
  // without a native-module change (out of this task's scope) — use the
  // length-proportional estimate Task 0.3 recommended as the fallback.
  const text = result.text ?? ''
  const pageCount = result.pageCount ?? 1
  return classify(text, pageCount, estimatePageBreaks(text.length, pageCount))
}

// Web path — pdfjs-dist (legacy build) parses the PDF bytes on the main thread.
// The worker module is imported and registered on `globalThis.pdfjsWorker` so
// pdf.js runs its worker logic inline (no separate worker file for Metro to emit).
async function extractOnWeb(uri: string): Promise<ExtractionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ;(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = workerMod

  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const doc = await loadingTask.promise

  // Web path: the per-page loop already runs to build `text`, so recording
  // each page's real starting offset (rather than an estimate) costs nothing
  // extra — just note the running length before each page is appended.
  const parts: string[] = []
  const pageCharCounts: number[] = []
  const pageBreaks: number[] = []
  let offset = 0
  const pageCount = doc.numPages
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageCharCounts.push(pageText.trim().length)
    pageBreaks.push(offset)
    parts.push(pageText)
    offset += pageText.length + 1 // +1 for the '\n' join separator below
  }
  await loadingTask.destroy()

  return classify(parts.join('\n').trim(), pageCount, pageBreaks, pageCharCounts)
}
