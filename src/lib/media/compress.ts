// Task 4.2 — iteratively compresses an already-rendered <canvas> under a byte
// budget. canvas.toBlob's output size varies with image content, so a single
// fixed quality value isn't reliable — step quality down first (cheap, no
// re-render), then downscale resolution and repeat if quality alone can't
// get under budget.
//
// The quality-stepping loop is pure control flow over an injected
// canvas-like object (`toBlob`/`getContext`), so it's testable in Jest with a
// mock — unlike src/lib/pdf/renderPage.ts, this doesn't require a real
// HTMLCanvasElement for that part. Downscaling does call
// `document.createElement('canvas')`, which is unavailable in this project's
// Jest environment (Task 0.1's spike) — that path is exercised only in a
// real browser (Task 4.4).

const QUALITY_STEPS = [0.8, 0.6, 0.4, 0.2]
const DOWNSCALE_FACTOR = 0.5
const MAX_DOWNSCALE_ROUNDS = 3
const MIME_TYPE = 'image/jpeg'

export type CompressResult = { blob: Blob; byteSize: number }

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, MIME_TYPE, quality))
}

function downscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const scaled = document.createElement('canvas')
  scaled.width = Math.max(1, Math.round(canvas.width * DOWNSCALE_FACTOR))
  scaled.height = Math.max(1, Math.round(canvas.height * DOWNSCALE_FACTOR))
  const ctx = scaled.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
  return scaled
}

export async function compressToTarget(canvas: HTMLCanvasElement, maxBytes: number): Promise<CompressResult> {
  let working = canvas
  let smallest: Blob | null = null

  for (let round = 0; round <= MAX_DOWNSCALE_ROUNDS; round += 1) {
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(working, quality)
      if (!blob) continue
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= maxBytes) return { blob, byteSize: blob.size }
    }
    if (round < MAX_DOWNSCALE_ROUNDS) working = downscale(working)
  }

  // Exhausted every quality/downscale attempt without hitting maxBytes —
  // return the smallest blob produced rather than throwing (per Task 4.3's
  // "never fail the whole record" contract, a still-oversized image is a
  // caller-side tradeoff, not a hard failure of this function).
  if (!smallest) throw new Error('Canvas compression failed to produce a blob')
  return { blob: smallest, byteSize: smallest.size }
}
