/** Dependency-free Base64 codec for SQLite BLOB backup serialization. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '='
    out += i + 2 < bytes.length ? ALPHABET[c & 63] : '='
  }
  return out
}

export function base64ToUint8Array(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '')
  if (clean.length % 4 !== 0) throw new Error('Invalid Base64 length')
  const output = new Uint8Array((clean.length / 4) * 3 - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0))
  let offset = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = ALPHABET.indexOf(clean[i])
    const b = ALPHABET.indexOf(clean[i + 1])
    const c = clean[i + 2] === '=' ? 0 : ALPHABET.indexOf(clean[i + 2])
    const d = clean[i + 3] === '=' ? 0 : ALPHABET.indexOf(clean[i + 3])
    if (a < 0 || b < 0 || (clean[i + 2] !== '=' && c < 0) || (clean[i + 3] !== '=' && d < 0)) throw new Error('Invalid Base64 data')
    output[offset++] = (a << 2) | (b >> 4)
    if (offset < output.length) output[offset++] = ((b & 15) << 4) | (c >> 2)
    if (offset < output.length) output[offset++] = ((c & 3) << 6) | d
  }
  return output
}
