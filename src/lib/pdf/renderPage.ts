// Task 4.1 — renders one PDF page to an off-screen <canvas> via pdfjs-dist,
// then to a Blob. Web-only: needs `document`/`HTMLCanvasElement`, neither of
// which this project's Jest environment provides (see Task 0.1's spike,
// doc.userDataFlow/kb4-DONE/p00-environment-spike.md) — cannot be unit-tested
// here, only verified in a real browser (Task 4.4).

// Render scale for captured pages — higher than 1.0 for legibility of
// embedded imaging (X-rays, scans) once compressed, without going so high
// that compressToTarget (Task 4.2) has to discard most of the detail anyway.
const RENDER_SCALE = 1.5

export type RenderedPage = { blob: Blob; width: number; height: number }

// Loads the PDF at `uri` and rasterizes one page to an off-screen canvas.
// Exported separately from renderPageToBlob so callers that need iterative
// compression (compressToTarget, Task 4.2, which operates on an
// already-rendered canvas) don't have to re-run the PDF render pass per
// compression attempt — src/lib/pipeline.ts's Task 4.3 wiring uses this
// directly rather than renderPageToBlob for that reason.
export async function renderPageToCanvas(uri: string, pageNumber: number): Promise<HTMLCanvasElement> {
  if (typeof document === 'undefined') {
    throw new Error('renderPageToCanvas requires a browser environment (document/HTMLCanvasElement)')
  }

  // Same web-only pdfjs-dist import pattern as src/lib/pdf/extract.ts's
  // extractOnWeb: the legacy build + worker registered on globalThis so
  // pdf.js runs its worker logic inline (no separate worker file for the
  // bundler to emit).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ;(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = workerMod

  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const doc = await loadingTask.promise

  try {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) throw new Error('Canvas 2D context unavailable')

    // pdfjs-dist ^6 requires `canvas` (not just `canvasContext`) in render()'s
    // parameters — see node_modules/pdfjs-dist/types/src/display/api.d.ts.
    await page.render({ canvas, canvasContext, viewport }).promise
    return canvas
  } finally {
    await loadingTask.destroy()
  }
}

// Render several pages from one parsed PDF document. Reopening and reparsing
// the entire file for every page can make large medical PDFs appear hung.
export async function renderPagesToCanvas(
 uri: string,
 pageNumbers: number[],
 onPage?: (pageNumber: number, canvas: HTMLCanvasElement) => Promise<void> | void,
 onPageError?: (pageNumber: number, error: unknown) => void,
): Promise<Map<number, HTMLCanvasElement>> {
 if (typeof document === 'undefined') {
 throw new Error('renderPagesToCanvas requires browser environment (document/HTMLCanvasElement)')
 }

 const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
 const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
 ;(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = workerMod
 const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer())
 const loadingTask = pdfjs.getDocument({ data: bytes })
 const doc = await loadingTask.promise
 const canvases = onPage ? null : new Map<number, HTMLCanvasElement>()
 try {
   for (const pageNumber of pageNumbers) {
     try {
       const page = await doc.getPage(pageNumber)
       const viewport = page.getViewport({ scale: RENDER_SCALE })
       const canvas = document.createElement('canvas')
       canvas.width = viewport.width
       canvas.height = viewport.height
       const canvasContext = canvas.getContext('2d')
       if (!canvasContext) throw new Error('Canvas 2D context unavailable')
       await page.render({ canvas, canvasContext, viewport }).promise
       if (onPage) await onPage(pageNumber, canvas)
       else canvases?.set(pageNumber, canvas)
     } catch (error) {
       onPageError?.(pageNumber, error)
       // Keep rendering the remaining pages if one page is malformed.
     }
   }
   return canvases ?? new Map<number, HTMLCanvasElement>()
 } finally {
   await loadingTask.destroy()
 }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
}

export async function renderPageToBlob(
  uri: string,
  pageNumber: number,
  mimeType: string,
  quality: number,
): Promise<RenderedPage> {
  const canvas = await renderPageToCanvas(uri, pageNumber)
  const blob = await canvasToBlob(canvas, mimeType, quality)
  if (!blob) throw new Error(`Failed to render page ${pageNumber} to blob`)
  return { blob, width: canvas.width, height: canvas.height }
}
