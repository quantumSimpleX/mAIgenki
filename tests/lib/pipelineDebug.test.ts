import { getPipelineDebugConfig, pipelineDebugEnabled, setPipelineDebugConfig, startPipelineDebugRun } from '@/lib/debug/pipelineDebug'

describe('pipeline debug controls', () => {
  afterEach(() => {
    setPipelineDebugConfig({ level: 'off' })
  })

  it('is off by default and supports runtime verbosity/category filters', () => {
    expect(getPipelineDebugConfig().level).toBe('trace')
    expect(pipelineDebugEnabled('info', 'pdf')).toBe(true)
    setPipelineDebugConfig({ level: 'debug', categories: ['pdf'] })
    expect(pipelineDebugEnabled('debug', 'pdf')).toBe(true)
    expect(pipelineDebugEnabled('trace', 'pdf')).toBe(false)
    expect(pipelineDebugEnabled('info', 'llm')).toBe(false)
  })

  it('reports a monotonic elapsed time for a run', () => {
    setPipelineDebugConfig({ level: 'trace' })
    const run = startPipelineDebugRun('test-run')
    expect(run.runId).toBe('test-run')
    expect(run.elapsedMs()).toBeGreaterThanOrEqual(0)
  })
})
