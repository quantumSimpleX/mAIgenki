import { compressToTarget } from '@/lib/media/compress'

// Task 4.2 — compressToTarget's quality/downscale loop is pure control flow
// over an injected canvas-like object, so it's testable in Jest with a mock
// even though this project's Jest environment has no real
// HTMLCanvasElement/document (Task 0.1's spike,
// doc.userDataFlow/kb4-DONE/p00-environment-spike.md). The downscale branch
// needs `document.createElement`, which we stub with a fake canvas factory
// for the same reason — this proves the loop bounds and fallback behavior,
// not real canvas rendering (that remains a real-browser-only check, Task 4.4).

function blobOfSize(size: number): Blob {
  return { size, type: 'image/jpeg' } as Blob
}

function makeFakeCanvas(toBlob: (cb: (blob: Blob | null) => void, mime: string, quality: number) => void) {
  return {
    width: 1000,
    height: 1000,
    getContext: jest.fn(() => ({ drawImage: jest.fn() })),
    toBlob,
  } as unknown as HTMLCanvasElement
}

describe('compressToTarget', () => {
  it('returns the first quality step already under maxBytes without trying lower ones', async () => {
    const toBlob = jest.fn((cb: (blob: Blob | null) => void) => cb(blobOfSize(100_000)))
    const canvas = makeFakeCanvas(toBlob)

    const result = await compressToTarget(canvas, 200_000)
    expect(result.byteSize).toBe(100_000)
    expect(toBlob).toHaveBeenCalledTimes(1)
  })

  it('steps through quality levels in descending order until one is under maxBytes', async () => {
    const sizesByQuality: Record<number, number> = { 0.8: 900_000, 0.6: 700_000, 0.4: 300_000, 0.2: 100_000 }
    const seenQualities: number[] = []
    const toBlob = jest.fn((cb: (blob: Blob | null) => void, _mime: string, quality: number) => {
      seenQualities.push(quality)
      cb(blobOfSize(sizesByQuality[quality]))
    })
    const canvas = makeFakeCanvas(toBlob)

    const result = await compressToTarget(canvas, 400_000)
    expect(result.byteSize).toBe(300_000)
    expect(seenQualities).toEqual([0.8, 0.6, 0.4])
  })

  it('downscales and retries when no quality step at the current size fits, bounding total attempts', async () => {
    const toBlob = jest.fn((cb: (blob: Blob | null) => void) => cb(blobOfSize(999_999))) // always over budget
    const originalDocument = (globalThis as any).document
    ;(globalThis as any).document = { createElement: jest.fn(() => makeFakeCanvas(toBlob)) }
    try {
      const canvas = makeFakeCanvas(toBlob)
      const result = await compressToTarget(canvas, 1) // impossible budget
      // Falls back to the smallest blob produced instead of throwing.
      expect(result.byteSize).toBe(999_999)
      // 4 quality steps × 4 passes (1 initial size + 3 downscale rounds) — the
      // loop terminates instead of retrying forever.
      expect(toBlob).toHaveBeenCalledTimes(16)
    } finally {
      (globalThis as any).document = originalDocument
    }
  })

  it('throws only when every toBlob call resolves null', async () => {
    const toBlob = jest.fn((cb: (blob: Blob | null) => void) => cb(null))
    const originalDocument = (globalThis as any).document
    ;(globalThis as any).document = { createElement: jest.fn(() => makeFakeCanvas(toBlob)) }
    try {
      const canvas = makeFakeCanvas(toBlob)
      await expect(compressToTarget(canvas, 1)).rejects.toThrow('Canvas compression failed to produce a blob')
    } finally {
      (globalThis as any).document = originalDocument
    }
  })
})
