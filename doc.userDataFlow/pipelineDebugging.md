# PDF → IndexedDB pipeline diagnostics

The pipeline keeps timing diagnostics in the production code, but they are disabled by default. Enable them from the browser console before uploading a record:

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

Logs never include PDF text, images, PII, or API keys. Capture the console output for a failing large file and compare the largest `durationMs`/`elapsedMs` value to identify the slow boundary. An `extract-failed`, `llm-*failure`, `enrichment-partial-failures`, or `transaction-failed` event identifies the error path.

