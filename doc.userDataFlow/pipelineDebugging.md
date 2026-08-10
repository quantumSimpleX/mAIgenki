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

In local development, the app creates a Markdown log incrementally as events arrive and automatically downloads it when the upload succeeds or fails. This means a failure still leaves a partial file showing the last completed event. No Console commands are required. Deployed builds default to logging off.

```js
downloadPipelineDebugLog()
```

The downloaded filename looks like `maigenki-pipeline-debug-2026-08-03T12-34-56-000Z.md`. Each Markdown entry contains a human-readable `stage` heading such as `PDF extraction`, `PII redaction`, `Structural analysis`, `Enrichment chunk 1-of-12`, `Clinical inference`, or `IndexedDB persistence`.

Logs never include PDF text, images, PII, or API keys. Capture the console output for a failing large file and compare the largest `durationMs`/`elapsedMs` value to identify the slow boundary. An `extract-failed`, `llm-*failure`, `enrichment-partial-failures`, or `transaction-failed` event identifies the error path.
