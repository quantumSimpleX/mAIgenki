# PDF → IndexedDB pipeline diagnostics

The pipeline keeps timing diagnostics in the production code. Local builds default to `trace` with Console + in-memory capture so a slow upload can be reproduced immediately. Set the global explicitly when you need a different scope:

```js
globalThis.__MAIGENKI_DEBUG__ = { level: 'trace' }
```

The supported levels are `off`, `error`, `warn`, `info`, `debug`, and `trace`. A higher level includes all lower-severity events. Categories can be narrowed without changing the build:

```js
globalThis.__MAIGENKI_DEBUG__ = {
  level: 'trace',
  categories: ['pdf', 'llm'],
}
```

Use `{ level: 'off' }` to disable logging. Every event includes a run id and elapsed milliseconds. The PDF extractor reports byte loading, document parsing, and (at trace level) each page's text extraction. The pipeline reports extraction, redaction, enrichment/fallback events, inference, image capture, and completion. IndexedDB reports persistence start/completion and transaction failures.

The browser creates a Markdown log incrementally in Origin Private File System (OPFS) as events arrive. This means a failure still leaves a partial file showing the last completed event. After reproducing the problem, download the accumulated Markdown log with a unique timestamped filename:

```js
downloadPipelineDebugLog()
```

The helper returns a filename such as `maigenki-pipeline-debug-2026-08-03T12-34-56-000Z.md`. Each Markdown entry contains a human-readable `stage` heading such as `PDF extraction`, `PII redaction`, `Structural analysis`, `Enrichment chunk 1-of-12`, `Clinical inference`, or `IndexedDB persistence`. Clear the in-memory buffer with `clearPipelineDebugLog()` before another run. To explicitly start a new incremental OPFS file, use `await startPipelineDebugFile()`. If OPFS is unavailable, the in-memory Markdown download remains available.

Logs never include PDF text, images, PII, or API keys. Capture the console output for a failing large file and compare the largest `durationMs`/`elapsedMs` value to identify the slow boundary. An `extract-failed`, `llm-*failure`, `enrichment-partial-failures`, or `transaction-failed` event identifies the error path.
