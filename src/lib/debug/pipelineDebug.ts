export type PipelineDebugLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type PipelineDebugCategory = 'pipeline' | 'pdf' | 'ocr' | 'llm' | 'db' | 'media' | 'ui'

export type PipelineDebugConfig = {
  level: PipelineDebugLevel
  categories?: PipelineDebugCategory[]
  output?: 'console' | 'memory' | 'both'
}

declare global {
  var __MAIGENKI_DEBUG__: PipelineDebugConfig | undefined
  var downloadPipelineDebugLog: (() => string | undefined) | undefined
  var clearPipelineDebugLog: (() => void) | undefined
}

const levelRank: Record<PipelineDebugLevel, number> = { off: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }
type PipelineDebugEntry = { timestamp: string; level: string; category: string; event: string; details: Record<string, unknown> }
const entries: PipelineDebugEntry[] = []
function stageFor(event: string, details: Record<string, unknown>): string {
  const label = typeof details.label === 'string' ? details.label : ''
  if (label === 'structure-analysis') return 'Structural analysis'
  if (label.startsWith('enrichment-chunk-')) return label.replace('enrichment-chunk-', 'Enrichment chunk ')
  if (event.startsWith('extraction') || event.startsWith('extract-') || event === 'bytes-loaded') return 'PDF extraction'
  if (event.startsWith('redaction')) return 'PII redaction'
  if (event.startsWith('inference')) return 'Clinical inference'
  if (event.startsWith('persist') || event.startsWith('transaction')) return 'IndexedDB persistence'
  if (event.startsWith('image-')) return 'Image capture and compression'
  if (event.startsWith('llm-')) return 'LLM routing'
  return 'Pipeline orchestration'
}

export function getPipelineDebugConfig(): PipelineDebugConfig {
  return globalThis.__MAIGENKI_DEBUG__ ?? { level: 'trace', output: 'both' }
}

export function setPipelineDebugConfig(config: PipelineDebugConfig): void {
  globalThis.__MAIGENKI_DEBUG__ = { ...config }
}

export function pipelineDebugEnabled(level: PipelineDebugLevel, category: PipelineDebugCategory): boolean {
  const config = getPipelineDebugConfig()
  return level !== 'off' && levelRank[config.level] >= levelRank[level]
    && (!config.categories || config.categories.includes(category))
}

export function pipelineDebug(
  level: Exclude<PipelineDebugLevel, 'off'>,
  category: PipelineDebugCategory,
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (!pipelineDebugEnabled(level, category) || typeof console === 'undefined') return
  const config = getPipelineDebugConfig()
  const { runId: _runId, elapsedMs: _elapsedMs, ...detailsWithoutTiming } = details
  if (config.output !== 'console') entries.push({ timestamp: new Date().toISOString(), level, category, event, details: { stage: stageFor(event, details), ...details } })
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  if (config.output !== 'memory') method('[mAIgenki:pipeline]', { level, category, event, ...detailsWithoutTiming, ...(_runId ? { runId: _runId } : {}), ...(_elapsedMs !== undefined ? { elapsedMs: _elapsedMs } : {}) })
}

export function downloadPipelineDebugLog(): string | undefined {
  if (entries.length === 0 || typeof document === 'undefined') return undefined
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `maigenki-pipeline-debug-${timestamp}.json`
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return filename
}

export function clearPipelineDebugLog(): void {
  entries.length = 0
}

globalThis.downloadPipelineDebugLog = downloadPipelineDebugLog
globalThis.clearPipelineDebugLog = clearPipelineDebugLog

export function debugError(error: unknown): Record<string, string> {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { message: String(error) }
}

export function startPipelineDebugRun(runId = Math.random().toString(36).slice(2, 10)) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const log = (level: Exclude<PipelineDebugLevel, 'off'>, category: PipelineDebugCategory, event: string, details: Record<string, unknown> = {}) => {
    pipelineDebug(level, category, event, { runId, elapsedMs: Math.round(now() - startedAt), ...details })
  }
  return { runId, startedAt, log, elapsedMs: () => Math.round(now() - startedAt) }
}
