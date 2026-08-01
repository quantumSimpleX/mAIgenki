import { runWithConcurrency } from '@/lib/llm/pool'

describe('runWithConcurrency', () => {
  it('never exceeds the concurrency limit', async () => {
    const limit = 3
    let inFlight = 0
    let maxInFlight = 0

    await runWithConcurrency(Array.from({ length: 10 }, (_, i) => i), limit, async (item) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return item * 2
    })

    expect(maxInFlight).toBeLessThanOrEqual(limit)
  })

  it('processes every item exactly once', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i)
    const seen: number[] = []

    await runWithConcurrency(items, 4, async (item) => {
      seen.push(item)
      return item
    })

    expect(seen.slice().sort((a, b) => a - b)).toEqual(items)
  })

  it('returns fulfilled results in item order with correct values', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async (item) => item * 10)
    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
    ])
  })

  it('one rejection does not block or skip the other items', async () => {
    const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      if (item === 3) throw new Error('boom')
      return item
    })

    expect(results).toHaveLength(5)
    expect(results[2]).toMatchObject({ status: 'rejected' })
    expect((results[2] as PromiseRejectedResult).reason.message).toBe('boom')
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4)
  })

  it('handles an empty items array', async () => {
    const results = await runWithConcurrency([], 3, async (item) => item)
    expect(results).toEqual([])
  })

  it('handles a limit larger than the item count', async () => {
    const results = await runWithConcurrency([1, 2], 10, async (item) => item)
    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 2 },
    ])
  })
})
