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

export function redactPII(text: string): string {
  // Pass 1a — extract patient names from labeled fields before replacing them
  const extractedNames: string[] = []
  for (const pattern of NAME_EXTRACT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim()
      if (name) extractedNames.push(name)
    }
  }

  // Pass 1b — apply all redaction rules
  let result = text
  for (const { pattern, replacement } of RULES) {
    result = result.replace(pattern, replacement)
  }

  // Pass 2 — sweep for all remaining occurrences of each extracted name
  for (const name of extractedNames) {
    const sweepPattern = buildNameSweepPattern(name)
    if (sweepPattern) {
      result = result.replace(sweepPattern, '[PATIENT NAME]')
    }
  }

  return result
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
