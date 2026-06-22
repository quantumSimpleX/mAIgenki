import { recognize } from 'expo-text-extractor'

export async function extractTextFromImage(uri: string): Promise<string> {
  const result = await recognize(uri)
  return result?.text ?? ''
}
