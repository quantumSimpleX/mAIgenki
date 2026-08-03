export type PipelineDebugLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type PipelineDebugCategory = 'pipeline' | 'pdf' | 'ocr' | 'llm' | 'db' | 'media' | 'ui'

export type PipelineDebugConfig = {
  level: PipelineDebugLevel
  categories?: PipelineDebugCategory[]
}

declare global {
  var __MAIGENKI_DEBUG__: PipelineDebugConfig | undefined
}

const levelRank: Record<PipelineDebugLevel, number> = { off: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }

export function getPipelineDebugConfig(): PipelineDebugConfig {
  return globalThis.__MAIGENKI_DEBUG__ ?? { level: 'off' }
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
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  method('[mAIgenki:pipeline]', { level, category, event, ...details })
}

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
