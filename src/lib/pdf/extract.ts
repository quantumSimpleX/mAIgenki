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
}

// Shared density check: too few characters per page ⇒ scanned/image-only PDF.
function classify(text: string, pageCount: number): ExtractionResult {
  const charsPerPage = pageCount > 0 ? text.length / pageCount : 0
  const method: 'text' | 'ocr' = charsPerPage >= MIN_CHARS_PER_PAGE ? 'text' : 'ocr'
  return { text, pageCount, method }
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

  return classify(result.text ?? '', result.pageCount ?? 1)
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

  const parts: string[] = []
  const pageCount = doc.numPages
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    parts.push(pageText)
  }
  await loadingTask.destroy()

  return classify(parts.join('\n').trim(), pageCount)
}
