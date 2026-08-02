// PII redaction — two-pass approach:
//   Pass 1: extract patient name(s) from labeled fields, then apply all
//           label-based and pattern-based redaction rules.
//   Pass 2: sweep the full text for every occurrence of any extracted name.
//
// Conservative by design: labeled patterns require a prefix so medical
// content (diagnoses, lab values, clinical dates) is never touched.
// Only email and SSN are matched standalone — both are structurally
// distinctive enough that false positives are negligible.

type Rule = { pattern: RegExp; replacement: string }

export type ProviderContact = {
  name: string | null
  email: string | null
  phone: string | null
  evidence: string
}

// ── Name extraction patterns (capture group 1 = the name value) ───────────────

const NAME_EXTRACT_PATTERNS: RegExp[] = [
  /\b(?:Patient|Patient Name|Name)\s*[:#]\s*([^\n\r]{1,60})/gi,
  /姓名\s*[：:]\s*([一-鿿぀-ゟ゠-ヿ\w]{1,20})/g,
  /氏名\s*[：:]\s*([一-鿿぀-ゟ゠-ヿ\w]{1,20})/g,
]

// ── Non-name redaction rules ──────────────────────────────────────────────────

const RULES: Rule[] = [
  // Patient name label (value already captured + swept in pass 2)
  { pattern: /\b(?:Patient|Patient Name|Name)\s*[:#]\s*[^\n\r]{1,60}/gi, replacement: '[PATIENT NAME]' },
  { pattern: /姓名\s*[：:]\s*[一-鿿぀-ゟ゠-ヿ\w]{1,20}/g, replacement: '[PATIENT NAME]' },
  { pattern: /氏名\s*[：:]\s*[一-鿿぀-ゟ゠-ヿ\w]{1,20}/g, replacement: '[PATIENT NAME]' },

  // Date of birth (EN / zh-TW / JA)
  { pattern: /\b(?:DOB|Date of Birth|Date of birth|Birth Date)\s*[:#]\s*[\d\/\-]+/gi, replacement: '[DATE OF BIRTH]' },
  { pattern: /出生日期\s*[：:]\s*[\d年月日\/\-\s]{1,20}/g, replacement: '[DATE OF BIRTH]' },
  { pattern: /生年月日\s*[：:]\s*[\d年月日\/\-\s]{1,20}/g, replacement: '[DATE OF BIRTH]' },

  // MRN
  { pattern: /\b(?:MRN|Medical Record Number|Medical Record No|Chart #|Chart No)\s*[:#]?\s*[\w\-]{1,20}/gi, replacement: '[MRN]' },

  // Phone (EN / zh-TW / JA)
  { pattern: /\b(?:Phone|Tel|Telephone|Mobile|Cell|Fax)\s*[:#]\s*[\d\s\(\)\-\+\.]{7,20}/gi, replacement: '[PHONE]' },
  { pattern: /電話\s*[：:]\s*[\d\-\s\(\)]{7,20}/g, replacement: '[PHONE]' },
  { pattern: /電話番号\s*[：:]\s*[\d\-\s]{7,20}/g, replacement: '[PHONE]' },

  // Insurance / policy
  { pattern: /\b(?:Insurance ID|Insurance No|Policy No|Policy Number|Member ID)\s*[:#]\s*[\w\-]{1,20}/gi, replacement: '[INSURANCE ID]' },

  // Email (standalone)
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },

  // SSN (standalone — XXX-XX-XXXX)
  { pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, replacement: '[SSN]' },

  // Taiwan National ID (labeled only)
  { pattern: /身份證(?:字號|號碼)?\s*[：:]\s*[A-Z]\d{9}/g, replacement: '[NATIONAL ID]' },

  // Japan My Number (labeled only)
  { pattern: /マイナンバー\s*[：:]\s*\d{12}/g, replacement: '[NATIONAL ID]' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEnglishName(name: string): boolean {
  return /[A-Za-z]/.test(name)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildNameSweepPattern(name: string): RegExp | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  if (isEnglishName(trimmed)) {
    // Require at least 3 characters to avoid sweeping common short tokens (e.g. "Li")
    if (trimmed.length < 3) return null
    return new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'gi')
  } else {
    // CJK names: require at least 2 characters
    if (trimmed.length < 2) return null
    return new RegExp(escapeRegex(trimmed), 'g')
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

type Edit = { start: number; end: number; replacement: string }

// Collects every redaction as a {start, end, replacement} span against the
// *original* (pre-redaction) text — a single source of truth both the output
// text and an original→redacted offset map (below, for rebasing pageBreaks)
// are built from, so the two can never drift apart.
function collectEdits(text: string): Edit[] {
  const edits: Edit[] = []
  const overlaps = (start: number, end: number) => edits.some((e) => start < e.end && end > e.start)

  // Pass 1a — extract patient names from labeled fields before matching them
  const extractedNames: string[] = []
  for (const pattern of NAME_EXTRACT_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim()
      if (name) extractedNames.push(name)
    }
  }

  // Pass 1b — every RULES match, in rule-precedence order (first rule to
  // claim a span wins, matching the old sequential-replace behavior).
  for (const { pattern, replacement } of RULES) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (!overlaps(start, end)) edits.push({ start, end, replacement })
      if (match[0].length === 0) pattern.lastIndex += 1 // guard against zero-width infinite loops
    }
  }

  // Pass 2 — every remaining occurrence of each extracted name, skipping any
  // span already claimed by pass 1b (i.e. the name's own labeled occurrence).
  for (const name of extractedNames) {
    const sweepPattern = buildNameSweepPattern(name)
    if (!sweepPattern) continue
    let match: RegExpExecArray | null
    while ((match = sweepPattern.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (!overlaps(start, end)) edits.push({ start, end, replacement: '[PATIENT NAME]' })
      if (match[0].length === 0) sweepPattern.lastIndex += 1
    }
  }

  return edits.sort((a, b) => a.start - b.start)
}

function applyEdits(text: string, edits: Edit[]): string {
  let result = ''
  let cursor = 0
  for (const edit of edits) {
    result += text.slice(cursor, edit.start) + edit.replacement
    cursor = edit.end
  }
  result += text.slice(cursor)
  return result
}

export function redactPII(text: string): string {
  return applyEdits(text, collectEdits(text))
}

// Redacts `text` and also returns a function that maps a character offset in
// the *original* text to the corresponding offset in the redacted text — for
// rebasing anything computed against the pre-redaction text (e.g. pipeline.ts's
// `pageBreaks`, whose offsets would otherwise drift once a replacement like
// `[PATIENT NAME]` changes the surrounding text's length).
export function redactPIIWithOffsetMap(text: string): { text: string; mapOffset: (originalOffset: number) => number } {
  const edits = collectEdits(text)
  const redactedText = applyEdits(text, edits)
  let cumulativeDelta = 0
  const breakpoints = edits.map((edit) => {
    cumulativeDelta += edit.replacement.length - (edit.end - edit.start)
    return { originalEnd: edit.end, deltaAfter: cumulativeDelta }
  })
  const mapOffset = (originalOffset: number): number => {
    let delta = 0
    for (const bp of breakpoints) {
      if (bp.originalEnd > originalOffset) break
      delta = bp.deltaAfter
    }
    return originalOffset + delta
  }
  return { text: redactedText, mapOffset }
}

// Capture labeled clinician contacts locally, before the general patient-PII
// pass removes phone numbers and email addresses from the text sent to the LLM.
export function extractProviderContacts(text: string): ProviderContact[] {
  const contacts: ProviderContact[] = []
  const lines = text.split(/\r?\n/)
  const clinicianLabel = /\b(?:doctor|physician|provider|attending|ordering|referring|author)\b/i
  const emailPattern = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/
  const phonePattern = /(?:\+?\d[\d\s().\-]{6,}\d)/

  for (let index = 0; index < lines.length; index += 1) {
    if (!clinicianLabel.test(lines[index])) continue
    const window = lines.slice(index, index + 3).join(' ')
    const nameMatch = lines[index].match(/(?:doctor|physician|provider|attending|ordering|referring|author)\s*[:\-]?\s*(?:Dr\.\s*)?([^,;|]+?)(?:\s+(?:email|phone|tel|fax)\b|$)/i)
    const email = window.match(emailPattern)?.[0] ?? null
    const phone = window.match(phonePattern)?.[0]?.trim() ?? null
    if (email || phone) {
      contacts.push({ name: nameMatch?.[1]?.trim() ?? null, email, phone, evidence: lines[index].trim() })
    }
  }

  return contacts
}
