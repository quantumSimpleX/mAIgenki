import type { SQLiteDatabase } from 'expo-sqlite'
import { DEFAULT_MODELS, updateModelChain, callLLMWithFallback } from './client'
import { upsertSetting } from '../db/queries'

// ── Weights ───────────────────────────────────────────────────────────────────
// Ordered by relevance to medical text extraction + structured JSON output.
// OR = OpenRouter artificial_analysis indices; Arena = arena.ai ELO categories.

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

export function scoreModel(
  model: OpenRouterModel,
  arena?: { documentElo?: number; instructionElo?: number },
): number {
  const aa = model.benchmarks?.artificial_analysis
  if (!aa) return -1

  const or: OrScores = {
    intelligence: aa.intelligence_index ?? 0,
    agentic:      aa.agentic_index      ?? 0,
    coding:       aa.coding_index       ?? 0,
  }

  const arenaScores =
    arena?.documentElo != null && arena?.instructionElo != null
      ? { document: arena.documentElo, instruction: arena.instructionElo }
      : null

  return compositeScore(or, arenaScores)
}

// ── Trigger gate ──────────────────────────────────────────────────────────────

export function shouldRefresh(lastChecked: string | null): boolean {
  if (!lastChecked) return true
  return Date.now() - new Date(lastChecked).getTime() > REFRESH_INTERVAL_MS
}

// ── Arena.ai scrape ───────────────────────────────────────────────────────────
// Fetches arena.ai/leaderboard and uses the LLM chain to extract Document ELO
// and Instruction Following ELO for the given model IDs. Returns a map of
// modelId → { documentElo, instructionElo }, empty map on any failure.

async function fetchArenaScores(
  modelIds: string[],
  apiKey: string,
): Promise<Map<string, { documentElo: number; instructionElo: number }>> {
  const result = new Map<string, { documentElo: number; instructionElo: number }>()
  try {
    const res = await fetch('https://arena.ai/leaderboard')
    if (!res.ok) return result
    const html = await res.text()

    const prompt = `You are given HTML from the arena.ai LLM leaderboard.
Extract the Document arena ELO and Instruction Following ELO for each of these model IDs:
${JSON.stringify(modelIds)}

Return ONLY a JSON array. No explanation. Format:
[{"id": "<model_id>", "document_elo": <number>, "instruction_elo": <number>}]

If a model is not found in the leaderboard, omit it from the array.
HTML content (truncated to relevant parts):
${html.slice(0, 8000)}`

    const llmResult = await callLLMWithFallback<Array<{ id: string; document_elo: number; instruction_elo: number }>>({
      messages: [{ role: 'user', content: prompt }],
      apiKey,
      temperature: 0,
      label: 'arena-scrape',
      validate: (content) => {
        try {
          const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (Array.isArray(parsed)) return parsed
        } catch { /* fall through */ }
        return null
      },
    })

    if (llmResult.ok && llmResult.value) {
      for (const entry of llmResult.value) {
        if (entry.id && entry.document_elo != null && entry.instruction_elo != null) {
          result.set(entry.id, { documentElo: entry.document_elo, instructionElo: entry.instruction_elo })
        }
      }
    }
  } catch {
    // arena.ai unreachable or LLM failed — caller handles empty map gracefully
  }
  return result
}

// ── Main refresh ──────────────────────────────────────────────────────────────

export async function refreshModelChain(
  db: SQLiteDatabase,
  apiKey: string,
): Promise<string[]> {
  try {
    // Step 1 — fetch free models from OpenRouter
    const res = await fetch('https://openrouter.ai/api/v1/models?max_price=0')
    const { data }: { data: OpenRouterModel[] } = await res.json()
    const freeModels = data.filter((m) => m.id.endsWith(':free'))

    // Step 2 — fetch arena ELO scores (best-effort; empty map on failure)
    const arenaScores = await fetchArenaScores(freeModels.map((m) => m.id), apiKey)

    // Step 3 — compute ELO normalisation range from available arena data
    const eloValues = Array.from(arenaScores.values())
    const docElos = eloValues.map((v) => v.documentElo)
    const instrElos = eloValues.map((v) => v.instructionElo)
    const docMin = Math.min(...docElos, 1100)
    const docMax = Math.max(...docElos, 1600)
    const instrMin = Math.min(...instrElos, 1100)
    const instrMax = Math.max(...instrElos, 1600)

    // Step 4 — score and sort
    const scored = freeModels.map((model) => {
      const arena = arenaScores.get(model.id)
      const arenaArg = arena
        ? {
            documentElo:     normaliseElo(arena.documentElo,  docMin,  docMax),
            instructionElo:  normaliseElo(arena.instructionElo, instrMin, instrMax),
          }
        : undefined
      return { id: model.id, score: scoreModel(model, arenaArg), contextLength: model.context_length ?? 0 }
    })

    scored.sort((a, b) => b.score - a.score || b.contextLength - a.contextLength)

    const chain = scored.slice(0, TOP_N).map((m) => m.id)

    // Step 5 — persist chain + timestamp
    await updateModelChain(db, chain)
    await upsertSetting(db, 'llm_chain_last_checked', new Date().toISOString())

    return chain
  } catch {
    // OpenRouter API unreachable — leave existing chain untouched, return defaults
    return DEFAULT_MODELS
  }
}
