import { Platform } from 'react-native'

export async function extractTextFromImage(uri: string): Promise<string> {
  // Defense in depth behind the UI gate: image OCR relies on a native module
  // that has no web implementation, so fail loudly rather than crash the bundle.
  if (Platform.OS === 'web') {
    throw new Error('Image OCR is not available on web')
  }
  // Dynamic import keeps the native-only `expo-text-extractor` out of web bundles.
  const { extractTextFromImage: extractFromLibrary } = await import('expo-text-extractor')
  const lines = await extractFromLibrary(uri)
  return lines.join('\n')
}
