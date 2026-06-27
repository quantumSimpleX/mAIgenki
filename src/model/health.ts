// 11 organ systems — IDs, labels, and colors are the design canonical source of truth.
// Order matches the legend panel in the body map (top → bottom).
export type OrgSystem =
  | 'integ'       // Integumentary
  | 'muscle'      // Muscular
  | 'skeletal'    // Skeletal
  | 'cardio'      // Circulatory
  | 'lymph'       // Lymphatic
  | 'neuro'       // Nervous
  | 'pulm'        // Respiratory
  | 'gi'          // Digestive
  | 'renal'       // Renal
  | 'endo'        // Endocrine
  | 'repro'       // Reproductive

export type ConditionStatus = 'documented' | 'resolved' | 'inferred'

export type Condition = {
  id: string
  name: string
  organ: string
  system: OrgSystem
  date: string
  status: ConditionStatus
  evidence: string
  sourceFile: string
}

export type HealthRecord = {
  id: string
  filename: string
  uploadedAt: string
  conditions: Condition[]
}

// Final confirmed colors from mAI Genki design (handoff04).
// repro updated from #7F1D1D → #C0526A in session 04 for visibility on dark bg.
export const SYSTEM_COLORS: Record<OrgSystem, string> = {
  integ:    '#4F46E5',
  muscle:   '#F472B6',
  skeletal: '#94A3B8',
  cardio:   '#EF4444',
  lymph:    '#22C55E',
  neuro:    '#EAB308',
  pulm:     '#06B6D4',
  gi:       '#F97316',
  renal:    '#84CC16',
  endo:     '#D946EF',
  repro:    '#C0526A',
}
