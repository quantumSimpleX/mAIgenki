import { extractTextWithInfo } from 'expo-pdf-text-extract'

// Minimum characters per page to be considered a text-based PDF.
// Below this threshold the PDF is treated as scanned (image-only pages).
export const MIN_CHARS_PER_PAGE = 50

export type ExtractionResult = {
  text: string
  pageCount: number
  // 'text' — embedded text extracted natively (fast, accurate)
  // 'ocr'  — scanned PDF detected; caller should surface a message to the user.
  //          Full on-device OCR is deferred (requires PDF-to-image rendering).
  method: 'text' | 'ocr'
}

export async function extractTextFromPDF(uri: string): Promise<ExtractionResult> {
  const result = await extractTextWithInfo(uri)

  if (!result.success) {
    throw new Error(result.errorCode ?? result.error ?? 'PDF extraction failed')
  }

  const pageCount = result.pageCount ?? 1
  const text = result.text ?? ''
  const charsPerPage = pageCount > 0 ? text.length / pageCount : 0
  const method: 'text' | 'ocr' = charsPerPage >= MIN_CHARS_PER_PAGE ? 'text' : 'ocr'

  return { text, pageCount, method }
}
