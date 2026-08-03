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

After reproducing the problem, download the accumulated JSON log with a unique timestamped filename:

```js
downloadPipelineDebugLog()
```

The helper returns the filename (for example `maigenki-pipeline-debug-2026-08-03T12-34-56-000Z.json`). Each JSON entry contains a human-readable `stage` heading such as `PDF extraction`, `PII redaction`, `Structural analysis`, `Enrichment chunk 1-of-12`, `Clinical inference`, or `IndexedDB persistence`. Clear the in-memory buffer with `clearPipelineDebugLog()` before another run. To capture only memory without Console output, use `{ level: 'trace', output: 'memory' }`.

Logs never include PDF text, images, PII, or API keys. Capture the console output for a failing large file and compare the largest `durationMs`/`elapsedMs` value to identify the slow boundary. An `extract-failed`, `llm-*failure`, `enrichment-partial-failures`, or `transaction-failed` event identifies the error path.
