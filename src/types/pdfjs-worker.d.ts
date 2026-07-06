// The pdfjs-dist legacy worker build ships no type declarations. It is only
// dynamically imported on web (see src/lib/pdf/extract.ts) to register the
// main-thread worker handler; we never touch its exports directly, so an opaque
// shape is enough to satisfy the strict-mode module resolver.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
