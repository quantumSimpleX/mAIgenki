// Web-guard for image OCR (Phase 9 B-P9-1). Forces Platform.OS = 'web' and
// asserts the defense-in-depth throw fires before any native module is touched.

import { Platform } from 'react-native'
import { extractTextFromImage } from '@/lib/ocr/extract'

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' })
})

describe('extractTextFromImage — web guard', () => {
  it('rejects with a clear web-unavailable error', async () => {
    await expect(extractTextFromImage('file:///photo.jpg'))
      .rejects.toThrow('Image OCR is not available on web')
  })
})
