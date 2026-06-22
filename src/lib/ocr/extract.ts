import { extractTextFromImage as extractFromLibrary } from 'expo-text-extractor'

export async function extractTextFromImage(uri: string): Promise<string> {
  const lines = await extractFromLibrary(uri)
  return lines.join('\n')
}
