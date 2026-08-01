import { DEFAULT_MODELS, updateModelChain } from './client'
import { putIndexedSetting } from '../db/indexedDb'

// ── Weights ───────────────────────────────────────────────────────────────────
// Ordered by relevance to medical text extraction + structured JSON output.
// OR = OpenRouter artificial_analysis indices. Arena weights (document,
// instruction) are redistributed onto OR weights — arena.ai scoring was
// removed (fragile scrape, burned free quota); see compositeScore below.

export const SCORE_WEIGHTS = {
  intelligence: 0.35, // OR: medical comprehension, MMLU correlation
  agentic:      0.25, // OR: instruction following, JSON schema adherence
  document:     0.25, // Arena: Document arena ELO (most relevant — medical records are documents)
  instruction:  0.15, // Arena: Instruction Following ELO
} as const

const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const TOP_N = 5

// ── Types ─────────────────────────────────────────────────────────────────────

type OrBenchmarks = {
  intelligence_index?: number
  agentic_index?: number
  coding_index?: number
}

type OpenRouterModel = {
  id: string
  context_length?: number
  benchmarks?: { artificial_analysis?: OrBenchmarks } | null
}

type ArenaScores = { document: number; instruction: number }

type OrScores = { intelligence: number; agentic: number; coding: number }

// ── Normalise ELO to 0–100 ────────────────────────────────────────────────────

export function normaliseElo(elo: number, min: number, max: number): number {
  if (max === min) return 50
  return Math.max(0, Math.min(100, ((elo - min) / (max - min)) * 100))
}

// ── Composite score ───────────────────────────────────────────────────────────
// When arena data is missing, redistribute its weight proportionally onto the
// OR weights so the total always sums to 1.0 and no signal is just zeroed out.

export function compositeScore(or: OrScores, arena: ArenaScores | null): number {
  if (arena) {
    return (
      or.intelligence * SCORE_WEIGHTS.intelligence +
      or.agentic      * SCORE_WEIGHTS.agentic +
      arena.document  * SCORE_WEIGHTS.document +
      arena.instruction * SCORE_WEIGHTS.instruction
    )
  }
  // Redistribute arena weights proportionally onto OR weights
  const orTotal = SCORE_WEIGHTS.intelligence + SCORE_WEIGHTS.agentic
  const scale = 1 / orTotal
  return (
    or.intelligence * SCORE_WEIGHTS.intelligence * scale +
    or.agentic      * SCORE_WEIGHTS.agentic      * scale
  )
}

// ── Score a single model ──────────────────────────────────────────────────────

export function scoreModel(model: OpenRouterModel): number {
  const aa = model.benchmarks?.artificial_analysis
  if (!aa) return -1

  const or: OrScores = {
    intelligence: aa.intelligence_index ?? 0,
    agentic:      aa.agentic_index      ?? 0,
    coding:       aa.coding_index       ?? 0,
  }

  return compositeScore(or, null)
}

// ── Trigger gate ──────────────────────────────────────────────────────────────

export function shouldRefresh(lastChecked: string | null): boolean {
  if (!lastChecked) return true
  return Date.now() - new Date(lastChecked).getTime() > REFRESH_INTERVAL_MS
}

// ── Main refresh ──────────────────────────────────────────────────────────────

export async function refreshModelChain(
  db: IDBDatabase,
  apiKey: string,
): Promise<string[]> {
  try {
    // Step 1 — fetch free models from OpenRouter
    const res = await fetch('https://openrouter.ai/api/v1/models?max_price=0')
    const { data }: { data: OpenRouterModel[] } = await res.json()
    const freeModels = data.filter((m) => m.id.endsWith(':free'))

    // Step 2 — score (from OpenRouter metadata only) and sort
    const scored = freeModels.map((model) => ({
      id: model.id,
      score: scoreModel(model),
      contextLength: model.context_length ?? 0,
    }))

    scored.sort((a, b) => b.score - a.score || b.contextLength - a.contextLength)

    const chain = scored.slice(0, TOP_N).map((m) => m.id)

    // Step 3 — persist chain + timestamp
    await updateModelChain(db, chain)
    await putIndexedSetting(db, 'llm_chain_last_checked', new Date().toISOString())

    return chain
  } catch {
    // OpenRouter API unreachable — leave existing chain untouched, return defaults
    return DEFAULT_MODELS
  }
}
