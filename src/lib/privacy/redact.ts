// Each rule replaces a labeled or pattern-matched PII field.
// Conservative by design: labeled patterns require a prefix so medical
// content (diagnoses, lab values, clinical dates) is never touched.
// Only email and SSN are matched standalone — both are structurally
// distinctive enough that false positives on medical data are negligible.

type Rule = { pattern: RegExp; replacement: string }

const RULES: Rule[] = [
  // ── Patient name ──────────────────────────────────────────────────────────
  // EN: "Patient: John Smith" or "Name: Jane Doe"
  { pattern: /\b(?:Patient|Patient Name|Name)\s*[:#]\s*[^\n\r]{1,60}/gi, replacement: '[PATIENT NAME]' },
  // zh-TW: 姓名：王大明
  { pattern: /姓名\s*[：:]\s*[一-鿿\w]{1,20}/g, replacement: '[PATIENT NAME]' },
  // JA: 氏名：山田太郎 (kanji, hiragana, katakana)
  { pattern: /氏名\s*[：:]\s*[぀-ゟ゠-ヿ一-鿿\w]{1,20}/g, replacement: '[PATIENT NAME]' },

  // ── Date of birth ─────────────────────────────────────────────────────────
  // EN: "DOB: 1958-03-22" or "Date of Birth: 03/22/1958"
  { pattern: /\b(?:DOB|Date of Birth|Date of birth|Birth Date)\s*[:#]\s*[\d\/\-]+/gi, replacement: '[DATE OF BIRTH]' },
  // zh-TW: 出生日期：1958年3月22日
  { pattern: /出生日期\s*[：:]\s*[\d年月日\/\-\s]{1,20}/g, replacement: '[DATE OF BIRTH]' },
  // JA: 生年月日：1958年3月22日
  { pattern: /生年月日\s*[：:]\s*[\d年月日\/\-\s]{1,20}/g, replacement: '[DATE OF BIRTH]' },

  // ── MRN ───────────────────────────────────────────────────────────────────
  { pattern: /\b(?:MRN|Medical Record Number|Medical Record No|Chart #|Chart No)\s*[:#]?\s*[\w\-]{1,20}/gi, replacement: '[MRN]' },

  // ── Phone ─────────────────────────────────────────────────────────────────
  // EN: "Phone: (617) 555-1234" / "Tel: +1-800-555-0100"
  { pattern: /\b(?:Phone|Tel|Telephone|Mobile|Cell|Fax)\s*[:#]\s*[\d\s\(\)\-\+\.]{7,20}/gi, replacement: '[PHONE]' },
  // zh-TW: 電話：02-1234-5678
  { pattern: /電話\s*[：:]\s*[\d\-\s\(\)]{7,20}/g, replacement: '[PHONE]' },
  // JA: 電話番号：03-1234-5678
  { pattern: /電話番号\s*[：:]\s*[\d\-\s]{7,20}/g, replacement: '[PHONE]' },

  // ── Insurance / policy ────────────────────────────────────────────────────
  { pattern: /\b(?:Insurance ID|Insurance No|Policy No|Policy Number|Member ID)\s*[:#]\s*[\w\-]{1,20}/gi, replacement: '[INSURANCE ID]' },

  // ── Email (standalone — structurally unique, safe without label) ──────────
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },

  // ── SSN (standalone — XXX-XX-XXXX is distinctive enough) ────────────────
  { pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, replacement: '[SSN]' },

  // ── Taiwan National ID (labeled only — letter + 9 digits is common in medical codes) ──
  { pattern: /身份證(?:字號|號碼)?\s*[：:]\s*[A-Z]\d{9}/g, replacement: '[NATIONAL ID]' },

  // ── Japan My Number (labeled only — 12 digits, too generic standalone) ───
  { pattern: /マイナンバー\s*[：:]\s*\d{12}/g, replacement: '[NATIONAL ID]' },
]

export function redactPII(text: string): string {
  let result = text
  for (const { pattern, replacement } of RULES) {
    result = result.replace(pattern, replacement)
  }
  return result
}
