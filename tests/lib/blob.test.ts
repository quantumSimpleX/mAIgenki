import { base64ToUint8Array, uint8ArrayToBase64 } from '@/lib/db/blob'

describe('BLOB backup codec', () => {
  it.each([
    new Uint8Array([]),
    new Uint8Array([0]),
    new Uint8Array([1, 2]),
    new Uint8Array([1, 2, 3]),
    new Uint8Array([0, 255, 17, 42, 99]),
  ])('round-trips bytes', (bytes) => {
    expect(Array.from(base64ToUint8Array(uint8ArrayToBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('round-trips through JSON serialization', () => {
    const bytes = new Uint8Array([7, 8, 9, 255])
    const json = JSON.stringify({ image_blob: uint8ArrayToBase64(bytes) })
    const parsed = JSON.parse(json) as { image_blob: string }
    expect(Array.from(base64ToUint8Array(parsed.image_blob))).toEqual(Array.from(bytes))
  })
})
