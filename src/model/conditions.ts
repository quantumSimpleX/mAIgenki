import type { OrgSystem, ConditionStatus } from '@/model/health'

export type SystemId = OrgSystem

export type SupportedLang = 'en' | 'zh-TW' | 'ja' | 'es'

// showConnectChip: rate_limit/quota_billing chat failures render an inline
// "Connect your account" chip beneath this message (lmfPlan.md Phase 6).
export type ChatMessage = { role: 'user' | 'assistant'; content: string; showConnectChip?: boolean }

export type DesignCondition = {
  id: string
  system: SystemId
  label: string
  medName: string
  localNames: Partial<Record<SupportedLang, string>>
  date: string
  yearFrac: number
  cx_percent: number
  cy_percent: number
  note: string
  evidence: string
  // Undefined for the hardcoded CONDITIONS fallback (pre-DB-load state) —
  // callers should treat missing status as 'documented'.
  status?: ConditionStatus
  locations?: Array<{
    cx_percent: number
    cy_percent: number
    anatomical_location?: string
    laterality?: string
  }>
}

// Condition dot positions are stored as percentages (0-100) of this viewBox,
// not raw asset pixels — this is the coordinate space bodymap.tsx actually
// renders into (see BodySvg's <Svg viewBox="0 0 260 460">), so positions stay
// correct across anatomy art swaps as long as the new art has the same aspect
// ratio as this viewBox.
export const SVG_VIEW_BOX_WIDTH = 260
export const SVG_VIEW_BOX_HEIGHT = 460

export function getSvgX(cx_percent: number): number {
  return (cx_percent / 100) * SVG_VIEW_BOX_WIDTH
}

export function getSvgY(cy_percent: number): number {
  return (cy_percent / 100) * SVG_VIEW_BOX_HEIGHT
}

export type ConditionRecord = {
  id: string
  type: 'TREND' | 'ECG' | 'IMAGING' | 'LABS' | 'SPIRO' | 'SCAN'
  label: string
  date: string
  color: string
  // Lazy reference to a stored record_images row — never raw bytes inline here.
  // Fetched on demand via getRecordImageThumbnail/getRecordImageBlob (Task 5.5/5.6).
  imageId?: string | null
  mimeType?: string | null
}

export const ALL_SYSTEMS: SystemId[] = [
  'integumentary', 'muscular', 'skeletal', 'cardiovascular', 'nervous',
  'digestive', 'respiratory', 'renal', 'lymphatic', 'endocrine', 'reproductive',
]

export const SYSTEM_META: Record<SystemId, { label: string; color: string }> = {
  integumentary:   { label: 'Integumentary',  color: '#4F46E5' },
  muscular:  { label: 'Muscular',       color: '#D946EF' },
  skeletal:{ label: 'Skeletal',       color: '#94A3B8' },
  cardiovascular:  { label: 'Cardiovascular', color: '#EF4444' },
  nervous:   { label: 'Nervous',        color: '#EAB308' },
  digestive:      { label: 'Digestive',      color: '#F97316' },
  respiratory:    { label: 'Respiratory',    color: '#06B6D4' },
  renal:   { label: 'Renal',          color: '#22C55E' },
  lymphatic:   { label: 'Lymphatic',      color: '#F472B6' },
  endocrine:    { label: 'Endocrine',      color: '#84CC16' },
  reproductive:   { label: 'Reproductive',   color: '#C0526A' },
}

const SYSTEM_ALIASES: Record<string, SystemId> = {
  integ: 'integumentary',
  skin: 'integumentary',
  muscle: 'muscular',
  musculoskeletal: 'muscular',
  bone: 'skeletal',
  cardio: 'cardiovascular',
  circulatory: 'cardiovascular',
  heart: 'cardiovascular',
  neuro: 'nervous',
  gi: 'digestive',
  gastrointestinal: 'digestive',
  pulm: 'respiratory',
  pulmonary: 'respiratory',
  kidney: 'renal',
  urinary: 'renal',
  lymph: 'lymphatic',
  endo: 'endocrine',
  repro: 'reproductive',
  reproductive: 'reproductive',
}

const SYSTEM_DEFAULT_POSITIONS: Record<SystemId, { cx: number; cy: number }> = {
  integumentary: { cx: 50, cy: 14 },
  muscular: { cx: 56, cy: 31 },
  skeletal: { cx: 48, cy: 38 },
  cardiovascular: { cx: 50, cy: 31 },
  nervous: { cx: 50, cy: 17 },
  digestive: { cx: 50, cy: 48 },
  respiratory: { cx: 50, cy: 30 },
  renal: { cx: 50, cy: 52 },
  lymphatic: { cx: 58, cy: 39 },
  endocrine: { cx: 50, cy: 24 },
  reproductive: { cx: 50, cy: 68 },
}

export function normalizeSystemId(system: string | null | undefined): SystemId {
  const key = (system ?? '').trim().toLowerCase()
  if ((ALL_SYSTEMS as string[]).includes(key)) return key as SystemId
  return SYSTEM_ALIASES[key] ?? 'integumentary'
}

function seededOffset(seed: string, salt: number): number {
  let hash = salt
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return (hash % 900) / 100 - 4.5
}

export function defaultConditionPosition(system: SystemId, seed = ''): { cx: number; cy: number } {
  const base = SYSTEM_DEFAULT_POSITIONS[system]
  return {
    cx: Math.max(12, Math.min(88, base.cx + seededOffset(seed, 17))),
    cy: Math.max(8, Math.min(88, base.cy + seededOffset(seed, 53))),
  }
}

const MONTH_IDX: Record<string, number> = {
  JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
  JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
}

export function parseDateFrac(d: string): number {
  const [yr, mo, day] = d.split('-')
  const year = parseInt(yr, 10)
  if (!Number.isFinite(year)) return 0
  const monthNum = parseInt(mo, 10)
  const monthIndex = Number.isFinite(monthNum) ? monthNum - 1 : MONTH_IDX[mo?.toUpperCase()]
  const dayNum = parseInt(day, 10)
  if (!Number.isFinite(monthIndex) || !Number.isFinite(dayNum)) return year
  return year + (monthIndex * 30.44 + dayNum) / 365.25
}

export function getLocalName(c: DesignCondition, lang: SupportedLang): string {
  if (lang === 'en') return c.label
  return c.localNames[lang] ?? c.label
}

export const CONDITIONS: DesignCondition[] = [
  {
    id: 'eczema', system: 'integumentary',
    label: 'Atopic dermatitis',
    medName: 'Atopic dermatitis with eosinophilia',
    localNames: { ja: 'アトピー性皮膚炎', es: 'Dermatitis atópica', 'zh-TW': '特應性皮膚炎' },
    date: '1982-MAR-17', yearFrac: parseDateFrac('1982-MAR-17'), cx_percent: 46.15, cy_percent: 14.78,
    note: 'Chronic eczema with flares on forearms and neck. Managed with topical corticosteroids and emollients.',
    evidence: 'Dr. Sarah Kim · Bay Area Skin & Allergy Institute · Oakland, CA, US',
  },
  {
    id: 'psoriasis', system: 'integumentary',
    label: 'Plaque psoriasis',
    medName: 'Psoriasis vulgaris',
    localNames: { ja: '尋常性乾癬', es: 'Psoriasis en placas', 'zh-TW': '銀屑病' },
    date: '1998-NOV-04', yearFrac: parseDateFrac('1998-NOV-04'), cx_percent: 52.62, cy_percent: 71.60,
    note: 'Moderate plaque psoriasis on elbows and knees. On methotrexate 15mg weekly with good response.',
    evidence: 'Dr. Meera Patel · St. Claire Medical Center · Boston, MA, US',
  },
  {
    id: 'fibro', system: 'muscular',
    label: 'Fibromyalgia',
    medName: 'Fibromyalgia syndrome (FMS)',
    localNames: { ja: '線維筋痛症', es: 'Fibromialgia', 'zh-TW': '纖維肌痛症' },
    date: '1992-JUL-22', yearFrac: parseDateFrac('1992-JUL-22'), cx_percent: 53.93, cy_percent: 16.37,
    note: 'Widespread musculoskeletal pain with fatigue and sleep disturbance. On duloxetine 60mg and graded exercise.',
    evidence: 'Dr. Luis Torres · Northwestern Memorial Hospital · Chicago, IL, US',
  },
  {
    id: 'rotator', system: 'muscular',
    label: 'Rotator cuff tear',
    medName: 'Partial-thickness supraspinatus tear',
    localNames: { ja: '腱板断裂', es: 'Desgarro del manguito rotador', 'zh-TW': '旋轉肌袖撕裂' },
    date: '1996-SEP-13', yearFrac: parseDateFrac('1996-SEP-13'), cx_percent: 64.83, cy_percent: 22.62,
    note: 'Partial thickness supraspinatus tear confirmed on MRI. Conservative management — physiotherapy ongoing.',
    evidence: 'Dr. James Nguyen & Dr. Elena Ruiz · Virginia Mason Medical Center / Seattle Sports & Spine · Seattle, WA, US',
    locations: [
      { cx_percent: 35.17, cy_percent: 22.62, anatomical_location: 'left shoulder', laterality: 'left' },
    ],
  },
  {
    id: 'disc', system: 'skeletal',
    label: 'L4–L5 disc herniation',
    medName: 'Lumbar disc herniation L4-L5 with radiculopathy',
    localNames: { ja: '腰椎椎間板ヘルニア（L4–L5）', es: 'Hernia discal L4–L5', 'zh-TW': '腰椎椎間盤突出' },
    date: '2002-AUG-11', yearFrac: parseDateFrac('2002-AUG-11'), cx_percent: 46.15, cy_percent: 45.22,
    note: 'MRI-confirmed disc herniation with mild L5 radiculopathy. Managed with PT and NSAIDs.',
    evidence: 'Dr. Richard Okafor · Houston Methodist Hospital · Houston, TX, US',
  },
  {
    id: 'osteo', system: 'skeletal',
    label: 'Osteopenia',
    medName: 'Osteopenia (T-score −1.8, lumbar spine)',
    localNames: { ja: '骨減少症', es: 'Osteopenia', 'zh-TW': '骨質減少症' },
    date: '2019-FEB-28', yearFrac: parseDateFrac('2019-FEB-28'), cx_percent: 48.98, cy_percent: 37.90,
    note: 'DEXA scan T-score −1.8 at lumbar spine. Calcium + vitamin D supplementation. Follow-up in 2 years.',
    evidence: 'Dr. Christine Lee & Dr. Miguel Alvarez · Oregon Health & Science University / Portland Bone Health Center · Portland, OR, US',
  },
  {
    id: 'fractures', system: 'skeletal', label: 'Multiple limb fractures', medName: 'Healed multi-limb fractures after high-energy trauma',
    localNames: { ja: '複数肢骨折', es: 'Fracturas múltiples de extremidades', 'zh-TW': '多處肢體骨折' },
    date: '1979-JUL-06', yearFrac: parseDateFrac('1979-JUL-06'), cx_percent: 37.50, cy_percent: 45.50,
    note: 'Multiple fractures of both forearms and lower legs after a high-energy accident at age 17. Healed with residual hardware and intermittent stiffness.',
    evidence: 'Dr. Elena Ruiz & Dr. Marcus Bell · Children’s Regional Trauma Center / North County Orthopedics · San Diego, CA, US',
    locations: [
      { cx_percent: 62.50, cy_percent: 45.50, anatomical_location: 'right forearm', laterality: 'right' },
      { cx_percent: 45.50, cy_percent: 78.00, anatomical_location: 'left lower leg', laterality: 'left' },
      { cx_percent: 54.50, cy_percent: 78.00, anatomical_location: 'right lower leg', laterality: 'right' },
    ],
  },
  {
    id: 'htn', system: 'cardiovascular',
    label: 'Hypertension',
    medName: 'Essential hypertension, stage 1',
    localNames: { ja: '高血圧症', es: 'Hipertensión arterial', 'zh-TW': '高血壓' },
    date: '2017-OCT-14', yearFrac: parseDateFrac('2017-OCT-14'), cx_percent: 46.42, cy_percent: 11.95,
    note: 'Systolic BP >140 mmHg across multiple visits. Currently managed with lisinopril 10mg daily.',
    evidence: 'Dr. Anuj Sharma & Dr. Priya Nair · Cleveland Clinic / University Hospitals · Cleveland, OH, US',
  },
  {
    id: 'afib', system: 'cardiovascular',
    label: 'Atrial fibrillation',
    medName: 'Paroxysmal atrial fibrillation',
    localNames: { ja: '心房細動', es: 'Fibrilación auricular', 'zh-TW': '心房顫動' },
    date: '2022-MAR-02', yearFrac: parseDateFrac('2022-MAR-02'), cx_percent: 52.82, cy_percent: 23.60,
    note: 'Paroxysmal AF detected on 48-hour Holter monitor. Anticoagulated with apixaban.',
    evidence: "Dr. Patrick Walsh & Dr. Mei Chen · St. Mary's Medical Center / New York Heart Center · New York, NY, US",
  },
  {
    id: 'lymph1', system: 'lymphatic',
    label: 'Reactive lymphadenopathy',
    medName: 'Reactive cervical lymphadenopathy',
    localNames: { ja: '反応性リンパ節腫脹', es: 'Linfadenopatía reactiva', 'zh-TW': '反應性淋巴結病' },
    date: '2013-JUN-09', yearFrac: parseDateFrac('2013-JUN-09'), cx_percent: 45.11, cy_percent: 13.33,
    note: 'Bilateral cervical lymph node enlargement. Resolved following antibiotic treatment for streptococcal pharyngitis.',
    evidence: 'Dr. Emily Brennan · Penn Medicine · Philadelphia, PA, US',
  },
  {
    id: 'mono', system: 'lymphatic',
    label: 'Infectious mononucleosis',
    medName: 'EBV-associated infectious mononucleosis',
    localNames: { ja: '伝染性単核球症', es: 'Mononucleosis infecciosa', 'zh-TW': '傳染性單核細胞增多症' },
    date: '1984-SEP-03', yearFrac: parseDateFrac('1984-SEP-03'), cx_percent: 56.50, cy_percent: 31.91,
    note: 'EBV-confirmed mononucleosis with splenomegaly. Full recovery over 6 weeks. No sports for 8 weeks.',
    evidence: 'Dr. Thomas Park · University of Michigan Health · Ann Arbor, MI, US',
  },
  {
    id: 'migraine', system: 'nervous',
    label: 'Migraine disorder',
    medName: 'Migraine with visual aura (ICHD-3)',
    localNames: { ja: '片頭痛', es: 'Migraña con aura', 'zh-TW': '偏頭痛' },
    date: '1988-MAY-23', yearFrac: parseDateFrac('1988-MAY-23'), cx_percent: 44.33, cy_percent: 6.51,
    note: 'Chronic migraine with visual aura, 4–6 episodes/month. On topiramate 50mg daily.',
    evidence: 'Dr. Nina Rodriguez · Cedars-Sinai Medical Center · Los Angeles, CA, US',
  },
  {
    id: 'carpal', system: 'nervous',
    label: 'Carpal tunnel syndrome',
    medName: 'Median nerve entrapment at the carpal tunnel',
    localNames: { ja: '手根管症候群', es: 'Síndrome del túnel carpiano', 'zh-TW': '腕管綜合症' },
    date: '2006-DEC-07', yearFrac: parseDateFrac('2006-DEC-07'), cx_percent: 22.87, cy_percent: 49.84,
    note: 'Right median nerve compression confirmed on NCS. Night splints and corticosteroid injection. Awaiting surgical consult.',
    evidence: 'Dr. Fumiko Yamamoto · El Camino Health · San Jose, CA, US',
  },
  {
    id: 'asthma', system: 'respiratory',
    label: 'Asthma',
    medName: 'Mild persistent asthma (GINA step 2)',
    localNames: { ja: '気管支喘息', es: 'Asma bronquial', 'zh-TW': '支氣管哮喘' },
    date: '1986-APR-18', yearFrac: parseDateFrac('1986-APR-18'), cx_percent: 47.87, cy_percent: 22.36,
    note: 'Mild persistent asthma, well-controlled on ICS/LABA. FEV1 88% predicted.',
    evidence: 'Dr. Brian Chen · UCHealth Medical Center · Denver, CO, US',
  },
  {
    id: 'covid', system: 'respiratory',
    label: 'COVID-19',
    medName: 'SARS-CoV-2 infection, moderate severity',
    localNames: { ja: '新型コロナウイルス感染症', es: 'COVID-19', 'zh-TW': '新冠肺炎' },
    date: '2021-FEB-17', yearFrac: parseDateFrac('2021-FEB-17'), cx_percent: 59.40, cy_percent: 26.78,
    note: 'Moderate infection with 8-day course. No hospitalization. Full pulmonary recovery confirmed at 3-month follow-up.',
    evidence: "Dr. Marcus Johnson · St. David's Medical Center · Austin, TX, US",
  },
  {
    id: 'gerd', system: 'digestive',
    label: 'GERD',
    medName: 'Gastroesophageal reflux disease, erosive (LA grade B)',
    localNames: { ja: '胃食道逆流症', es: 'Enfermedad por reflujo gastroesofágico', 'zh-TW': '胃食管反流病' },
    date: '2008-MAR-30', yearFrac: parseDateFrac('2008-MAR-30'), cx_percent: 50.06, cy_percent: 26.30,
    note: 'Erosive esophagitis (LA grade B) confirmed on EGD. On pantoprazole 40mg daily with good symptom control.',
    evidence: 'Dr. Harpreet Singh · Emory University Hospital · Atlanta, GA, US',
  },
  {
    id: 'ibs', system: 'digestive',
    label: 'Irritable bowel syndrome',
    medName: 'Irritable bowel syndrome — mixed type (IBS-M)',
    localNames: { ja: '過敏性腸症候群', es: 'Síndrome del intestino irritable', 'zh-TW': '腸易激綜合症' },
    date: '2024-AUG-15', yearFrac: parseDateFrac('2024-AUG-15'), cx_percent: 50.16, cy_percent: 49.82,
    note: 'IBS-mixed type diagnosed per Rome IV criteria. Low-FODMAP diet with partial response. Mebeverine PRN.',
    evidence: 'Dr. Olivia Murphy · Massachusetts General Hospital · Boston, MA, US',
  },
  {
    id: 'stones', system: 'renal',
    label: 'Kidney stones',
    medName: 'Calcium oxalate nephrolithiasis',
    localNames: { ja: '尿路結石', es: 'Litiasis renal', 'zh-TW': '腎結石' },
    date: '2016-SEP-05', yearFrac: parseDateFrac('2016-SEP-05'), cx_percent: 44.32, cy_percent: 37.12,
    note: '4mm left ureteral calculus — calcium oxalate. Passed spontaneously. Low-oxalate diet commenced.',
    evidence: 'Dr. Kevin Williams · Northwestern Memorial Hospital · Chicago, IL, US',
  },
  {
    id: 'uti', system: 'renal',
    label: 'Recurrent UTIs',
    medName: 'Recurrent uncomplicated urinary tract infections',
    localNames: { ja: '再発性尿路感染症', es: 'Infecciones urinarias recurrentes', 'zh-TW': '復發性尿路感染' },
    date: '2015-APR-11', yearFrac: parseDateFrac('2015-APR-11'), cx_percent: 49.86, cy_percent: 55.16,
    note: 'Three culture-confirmed UTIs in 12 months. E. coli predominant. Post-coital prophylaxis with nitrofurantoin.',
    evidence: 'Dr. Divya Patel · Valleywise Health Medical Center · Phoenix, AZ, US',
  },
  {
    id: 'thyroid', system: 'endocrine',
    label: 'Hypothyroidism',
    medName: 'Primary hypothyroidism',
    localNames: { ja: '甲状腺機能低下症', es: 'Hipotiroidismo', 'zh-TW': '甲狀腺功能減退症' },
    date: '2018-NOV-19', yearFrac: parseDateFrac('2018-NOV-19'), cx_percent: 51.25, cy_percent: 15.34,
    note: 'TSH 8.2 mIU/L at diagnosis. On levothyroxine 75mcg daily; now euthyroid with TSH 1.4 mIU/L.',
    evidence: 'Dr. Yuna Kim · Mayo Clinic Health System · Minneapolis, MN, US',
  },
  {
    id: 'vitd', system: 'endocrine',
    label: 'Vitamin D deficiency',
    medName: '25-OH Vitamin D deficiency (< 30 nmol/L)',
    localNames: { ja: 'ビタミンD欠乏症', es: 'Deficiencia de vitamina D', 'zh-TW': '維生素D缺乏症' },
    date: '2011-JUL-08', yearFrac: parseDateFrac('2011-JUL-08'), cx_percent: 53.41, cy_percent: 32.83,
    note: '25-OH vitamin D 14 nmol/L. Loading dose completed; now on maintenance 1000 IU daily. Annual monitoring.',
    evidence: 'Dr. Brian Chen · UCHealth Medical Center · Denver, CO, US',
  },
  {
    id: 'bph', system: 'reproductive',
    label: 'Benign prostatic hyperplasia',
    medName: 'Benign prostatic hyperplasia, moderate LUTS',
    localNames: { ja: '前立腺肥大症', es: 'Hiperplasia prostática benigna', 'zh-TW': '良性前列腺增生' },
    date: '2020-JUN-22', yearFrac: parseDateFrac('2020-JUN-22'), cx_percent: 50.59, cy_percent: 51.63,
    note: 'Enlarged prostate (45g) on ultrasound with moderate LUTS (IPSS 14). On tamsulosin 0.4mg daily.',
    evidence: 'Dr. Adaeze Obi · George Washington University Hospital · Washington, DC, US',
  },
  {
    id: 'ed', system: 'reproductive',
    label: 'Erectile dysfunction',
    medName: 'Erectile dysfunction, vasculogenic',
    localNames: { ja: '勃起不全', es: 'Disfunción eréctil', 'zh-TW': '勃起功能障礙' },
    date: '2019-OCT-29', yearFrac: parseDateFrac('2019-OCT-29'), cx_percent: 50.09, cy_percent: 53.43,
    note: 'Vasculogenic erectile dysfunction confirmed on duplex ultrasound. Managed with sildenafil PRN.',
    evidence: 'Dr. Sachi Nakamura · UCSF Medical Center · San Francisco, CA, US',
  },
]

export const CONDITION_RECORDS: Record<string, ConditionRecord[]> = {
  htn: [
    { id: 'r-htn-1', type: 'TREND', label: 'BP trend', date: '2017–2024', color: '#EF4444' },
    { id: 'r-htn-2', type: 'ECG', label: '12-lead ECG', date: '2022-JUL', color: '#EF4444' },
    { id: 'r-htn-3', type: 'LABS', label: 'Renal panel', date: '2024-JAN', color: '#EF4444' },
  ],
  afib: [
    { id: 'r-afib-1', type: 'ECG', label: 'Holter strip', date: '2022-MAR', color: '#EF4444' },
    { id: 'r-afib-2', type: 'IMAGING', label: 'Echocardiogram', date: '2022-APR', color: '#EF4444' },
  ],
  migraine: [
    { id: 'r-mig-1', type: 'IMAGING', label: 'Brain MRI', date: '1988-MAY', color: '#EAB308' },
    { id: 'r-mig-2', type: 'TREND', label: 'Episode log', date: '2022–2024', color: '#EAB308' },
  ],
  carpal: [
    { id: 'r-carp-1', type: 'LABS', label: 'Nerve conduction', date: '2006-DEC', color: '#EAB308' },
  ],
  asthma: [
    { id: 'r-asth-1', type: 'SPIRO', label: 'Spirometry', date: '2024-FEB', color: '#06B6D4' },
    { id: 'r-asth-2', type: 'TREND', label: 'Peak flow log', date: '2023-NOV', color: '#06B6D4' },
  ],
  covid: [
    { id: 'r-cov-1', type: 'IMAGING', label: 'Chest CT', date: '2021-FEB', color: '#06B6D4' },
    { id: 'r-cov-2', type: 'LABS', label: 'PCR / labs', date: '2021-FEB', color: '#06B6D4' },
    { id: 'r-cov-3', type: 'SPIRO', label: '3-mo follow-up', date: '2021-MAY', color: '#06B6D4' },
  ],
  disc: [
    { id: 'r-disc-1', type: 'IMAGING', label: 'L4–L5 MRI', date: '2002-AUG', color: '#94A3B8' },
    { id: 'r-disc-2', type: 'IMAGING', label: 'X-ray lateral', date: '2022-JAN', color: '#94A3B8' },
  ],
  osteo: [
    { id: 'r-osteo-1', type: 'SCAN', label: 'DEXA scan', date: '2019-FEB', color: '#94A3B8' },
    { id: 'r-osteo-2', type: 'LABS', label: 'Bone markers', date: '2019-MAR', color: '#94A3B8' },
  ],
  fractures: [
    { id: 'r-fractures-1', type: 'IMAGING', label: 'Trauma X-rays', date: '1979-JUL', color: '#94A3B8' },
    { id: 'r-fractures-2', type: 'IMAGING', label: 'Orthopedic follow-up', date: '1980-JAN', color: '#94A3B8' },
  ],
  fibro: [
    { id: 'r-fibro-1', type: 'LABS', label: 'Inflammatory', date: '1992-JUL', color: '#D946EF' },
    { id: 'r-fibro-2', type: 'TREND', label: 'Pain scores', date: '2022–2024', color: '#D946EF' },
  ],
  rotator: [
    { id: 'r-rot-1', type: 'IMAGING', label: 'Shoulder MRI', date: '1996-SEP', color: '#D946EF' },
    { id: 'r-rot-2', type: 'IMAGING', label: 'Ultrasound rotator', date: '1997-FEB', color: '#D946EF' },
  ],
  gerd: [
    { id: 'r-gerd-1', type: 'IMAGING', label: 'EGD photos', date: '2008-MAR', color: '#F97316' },
    { id: 'r-gerd-2', type: 'LABS', label: 'H. pylori test', date: '2008-APR', color: '#F97316' },
  ],
  ibs: [
    { id: 'r-ibs-1', type: 'LABS', label: 'GI panel', date: '2017-AUG', color: '#F97316' },
    { id: 'r-ibs-2', type: 'TREND', label: 'Symptom log', date: '2023-DEC', color: '#F97316' },
  ],
  stones: [
    { id: 'r-stone-1', type: 'IMAGING', label: 'KUB X-ray', date: '2016-SEP', color: '#22C55E' },
    { id: 'r-stone-2', type: 'LABS', label: 'Stone analysis', date: '2016-SEP', color: '#22C55E' },
  ],
  uti: [
    { id: 'r-uti-1', type: 'LABS', label: 'Urine cultures', date: '2020–2024', color: '#22C55E' },
    { id: 'r-uti-2', type: 'TREND', label: 'Recurrence log', date: '2020–2024', color: '#22C55E' },
  ],
  thyroid: [
    { id: 'r-thy-1', type: 'LABS', label: 'TSH / T4', date: '2024-MAR', color: '#84CC16' },
    { id: 'r-thy-2', type: 'IMAGING', label: 'Thyroid US', date: '2019-JAN', color: '#84CC16' },
    { id: 'r-thy-3', type: 'TREND', label: 'TSH trend', date: '2017–2024', color: '#84CC16' },
  ],
  vitd: [
    { id: 'r-vitd-1', type: 'LABS', label: '25-OH Vit D', date: '2024-APR', color: '#84CC16' },
    { id: 'r-vitd-2', type: 'TREND', label: 'Level trend', date: '2015–2024', color: '#84CC16' },
  ],
  lymph1: [
    { id: 'r-lym-1', type: 'IMAGING', label: 'Neck US', date: '2016-JUN', color: '#F472B6' },
    { id: 'r-lym-2', type: 'LABS', label: 'CBC / diff', date: '2016-JUN', color: '#F472B6' },
  ],
  mono: [
    { id: 'r-mono-1', type: 'LABS', label: 'EBV antibodies', date: '2014-SEP', color: '#F472B6' },
    { id: 'r-mono-2', type: 'IMAGING', label: 'Abdomen US', date: '2014-SEP', color: '#F472B6' },
  ],
  eczema: [
    { id: 'r-ecz-1', type: 'IMAGING', label: 'Skin photos', date: '2023-MAR', color: '#4F46E5' },
    { id: 'r-ecz-2', type: 'LABS', label: 'Allergy panel', date: '2022-NOV', color: '#4F46E5' },
  ],
  psoriasis: [
    { id: 'r-pso-1', type: 'IMAGING', label: 'Lesion photos', date: '2023-AUG', color: '#4F46E5' },
    { id: 'r-pso-2', type: 'TREND', label: 'PASI score log', date: '2019–2024', color: '#4F46E5' },
  ],
  bph: [
    { id: 'r-bph-1', type: 'IMAGING', label: 'Prostate US', date: '2022-JUN', color: '#C0526A' },
    { id: 'r-bph-2', type: 'LABS', label: 'PSA / IPSS', date: '2023-JAN', color: '#C0526A' },
  ],
  ed: [
    { id: 'r-ed-1', type: 'IMAGING', label: 'Duplex US', date: '2016-OCT', color: '#C0526A' },
    { id: 'r-ed-2', type: 'LABS', label: 'Hormone panel', date: '2024-FEB', color: '#C0526A' },
    { id: 'r-ed-3', type: 'TREND', label: 'Symptom log', date: '2023–2024', color: '#C0526A' },
  ],
}
