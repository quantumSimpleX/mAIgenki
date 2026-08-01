// Dependency-free fixed-size worker pool (Task 3.4). Replaces unlimited
// Promise.all fan-out for per-chunk LLM extraction calls (src/lib/llm/enrich.ts)
// so a large record's chunk count doesn't open dozens of concurrent requests at
// once. Safe under service.ts's module-level `cooldownLedger` — JS is
// single-threaded, so a 429 on one in-flight call correctly cools that
// provider:model for the others via the existing fallback logic in
// client.ts/engine.ts before they retry.

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  const poolSize = Math.max(1, Math.min(limit, items.length))

  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        const value = await worker(items[index], index)
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => runWorker()))
  return results
}
