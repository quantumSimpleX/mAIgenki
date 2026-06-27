import type { OrgSystem } from '@/model/health'

export type SystemId = OrgSystem

export type SupportedLang = 'en' | 'zh-TW' | 'ja' | 'es'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type DesignCondition = {
  id: string
  system: SystemId
  label: string
  medName: string
  localNames: Partial<Record<SupportedLang, string>>
  date: string
  yearFrac: number
  cx: number
  cy: number
  note: string
  evidence: string
}

export const ALL_SYSTEMS: SystemId[] = [
  'integ', 'muscle', 'skeletal', 'cardio', 'lymph',
  'neuro', 'pulm', 'gi', 'renal', 'endo', 'repro',
]

export const SYSTEM_META: Record<SystemId, { label: string; color: string }> = {
  integ:   { label: 'Integumentary', color: '#4F46E5' },
  muscle:  { label: 'Muscular',      color: '#F472B6' },
  skeletal:{ label: 'Skeletal',      color: '#94A3B8' },
  cardio:  { label: 'Circulatory',   color: '#EF4444' },
  lymph:   { label: 'Lymphatic',     color: '#22C55E' },
  neuro:   { label: 'Nervous',       color: '#EAB308' },
  pulm:    { label: 'Respiratory',   color: '#06B6D4' },
  gi:      { label: 'Digestive',     color: '#F97316' },
  renal:   { label: 'Renal',         color: '#84CC16' },
  endo:    { label: 'Endocrine',     color: '#D946EF' },
  repro:   { label: 'Reproductive',  color: '#C0526A' },
}

const MONTH_IDX: Record<string, number> = {
  JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
  JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
}

export function parseDateFrac(d: string): number {
  const [yr, mo, day] = d.split('-')
  return parseInt(yr) + (MONTH_IDX[mo] * 30.44 + parseInt(day)) / 365.25
}

export function getLocalName(c: DesignCondition, lang: SupportedLang): string {
  if (lang === 'en') return c.label
  return c.localNames[lang] ?? c.label
}

export const CONDITIONS: DesignCondition[] = [
  {
    id: 'eczema', system: 'integ',
    label: 'Atopic dermatitis',
    medName: 'Atopic dermatitis (ICD-10: L20)',
    localNames: { ja: 'アトピー性皮膚炎', es: 'Dermatitis atópica', 'zh-TW': '特應性皮膚炎' },
    date: '2013-MAR-17', yearFrac: parseDateFrac('2013-MAR-17'), cx: 160, cy: 80,
    note: 'Chronic relapsing eczema; managed with topical corticosteroids.',
    evidence: 'Dermatology consult 2013; patch-tested negative for contact allergens.',
  },
  {
    id: 'psoriasis', system: 'integ',
    label: 'Plaque psoriasis',
    medName: 'Plaque psoriasis (ICD-10: L40.0)',
    localNames: { ja: '尋常性乾癬', es: 'Psoriasis en placas', 'zh-TW': '銀屑病' },
    date: '2018-NOV-04', yearFrac: parseDateFrac('2018-NOV-04'), cx: 80, cy: 310,
    note: 'Plaques on elbows and knees; PASI 7 at baseline.',
    evidence: 'Biopsy confirmed; dermatology clinic Nov 2018.',
  },
  {
    id: 'fibro', system: 'muscle',
    label: 'Fibromyalgia',
    medName: 'Fibromyalgia (ICD-10: M79.7)',
    localNames: { ja: '線維筋痛症', es: 'Fibromialgia', 'zh-TW': '纖維肌痛症' },
    date: '2019-JUL-22', yearFrac: parseDateFrac('2019-JUL-22'), cx: 100, cy: 230,
    note: 'Widespread musculoskeletal pain with fatigue; ACR 2010 criteria met.',
    evidence: 'Rheumatology consult Jul 2019; 11/18 tender points.',
  },
  {
    id: 'rotator', system: 'muscle',
    label: 'Rotator cuff tear',
    medName: 'Rotator cuff tear, right shoulder (ICD-10: M75.1)',
    localNames: { ja: '腱板断裂', es: 'Desgarro del manguito rotador', 'zh-TW': '旋轉肌袖撕裂' },
    date: '2022-SEP-13', yearFrac: parseDateFrac('2022-SEP-13'), cx: 64, cy: 148,
    note: 'Partial thickness supraspinatus tear; physiotherapy initiated.',
    evidence: 'MRI right shoulder Sep 2022.',
  },
  {
    id: 'disc', system: 'skeletal',
    label: 'L4–L5 disc herniation',
    medName: 'L4–L5 intervertebral disc herniation with radiculopathy (ICD-10: M51.1)',
    localNames: { ja: '腰椎椎間板ヘルニア（L4–L5）', es: 'Hernia discal L4–L5', 'zh-TW': '腰椎椎間盤突出' },
    date: '2020-AUG-11', yearFrac: parseDateFrac('2020-AUG-11'), cx: 130, cy: 325,
    note: 'Posterior central herniation; left L5 dermatomal pain.',
    evidence: 'MRI lumbar spine Aug 2020; neurology consult.',
  },
  {
    id: 'osteo', system: 'skeletal',
    label: 'Osteopenia',
    medName: 'Osteopenia, generalized (ICD-10: M85.8)',
    localNames: { ja: '骨減少症', es: 'Osteopenia', 'zh-TW': '骨質減少症' },
    date: '2023-FEB-28', yearFrac: parseDateFrac('2023-FEB-28'), cx: 130, cy: 385,
    note: 'T-score −1.8 (lumbar) on DEXA; calcium + D3 supplementation.',
    evidence: 'DEXA scan Feb 2023.',
  },
  {
    id: 'htn', system: 'cardio',
    label: 'Hypertension',
    medName: 'Essential (primary) hypertension (ICD-10: I10)',
    localNames: { ja: '高血圧症', es: 'Hipertensión arterial', 'zh-TW': '高血壓' },
    date: '2019-OCT-14', yearFrac: parseDateFrac('2019-OCT-14'), cx: 112, cy: 168,
    note: 'Stage 1; managed with ACE inhibitor. BP target <130/80.',
    evidence: 'Ambulatory BP monitoring Oct 2019.',
  },
  {
    id: 'afib', system: 'cardio',
    label: 'Atrial fibrillation',
    medName: 'Paroxysmal atrial fibrillation (ICD-10: I48.0)',
    localNames: { ja: '心房細動', es: 'Fibrilación auricular', 'zh-TW': '心房顫動' },
    date: '2021-MAR-02', yearFrac: parseDateFrac('2021-MAR-02'), cx: 135, cy: 178,
    note: 'Paroxysmal episodes; rate-controlled; CHA₂DS₂-VASc score 2.',
    evidence: 'Holter monitor Mar 2021; cardiology follow-up.',
  },
  {
    id: 'lymph1', system: 'lymph',
    label: 'Reactive lymphadenopathy',
    medName: 'Reactive lymphadenopathy, cervical (ICD-10: R59.0)',
    localNames: { ja: '反応性リンパ節腫脹', es: 'Linfadenopatía reactiva', 'zh-TW': '反應性淋巴結病' },
    date: '2016-JUN-09', yearFrac: parseDateFrac('2016-JUN-09'), cx: 76, cy: 130,
    note: 'Self-resolving; bilateral anterior cervical nodes <2 cm.',
    evidence: 'Ultrasound neck Jun 2016; resolved within 6 weeks.',
  },
  {
    id: 'mono', system: 'lymph',
    label: 'Infectious mononucleosis',
    medName: 'Infectious mononucleosis due to EBV (ICD-10: B27.0)',
    localNames: { ja: '伝染性単核球症', es: 'Mononucleosis infecciosa', 'zh-TW': '傳染性單核細胞增多症' },
    date: '2014-SEP-03', yearFrac: parseDateFrac('2014-SEP-03'), cx: 152, cy: 130,
    note: 'Classic triad: fever, pharyngitis, lymphadenopathy; splenomegaly noted.',
    evidence: 'EBV heterophile antibody positive Sep 2014.',
  },
  {
    id: 'migraine', system: 'neuro',
    label: 'Migraine disorder',
    medName: 'Migraine with visual aura (ICHD-3 / ICD-10: G43.1)',
    localNames: { ja: '片頭痛', es: 'Migraña con aura', 'zh-TW': '偏頭痛' },
    date: '2018-MAY-23', yearFrac: parseDateFrac('2018-MAY-23'), cx: 148, cy: 45,
    note: 'Visual aura preceding unilateral throbbing headache; ~3 episodes/month.',
    evidence: 'Neurology consult May 2018; MRI brain unremarkable.',
  },
  {
    id: 'carpal', system: 'neuro',
    label: 'Carpal tunnel syndrome',
    medName: 'Carpal tunnel syndrome, bilateral (ICD-10: G56.0)',
    localNames: { ja: '手根管症候群', es: 'Síndrome del túnel carpiano', 'zh-TW': '腕管綜合症' },
    date: '2021-DEC-07', yearFrac: parseDateFrac('2021-DEC-07'), cx: 38, cy: 272,
    note: 'Bilateral; right > left; nocturnal paresthesias; splinting effective.',
    evidence: 'Nerve conduction study Dec 2021.',
  },
  {
    id: 'asthma', system: 'pulm',
    label: 'Asthma',
    medName: 'Moderate persistent asthma (ICD-10: J45.1)',
    localNames: { ja: '気管支喘息', es: 'Asma bronquial', 'zh-TW': '支氣管哮喘' },
    date: '2015-APR-18', yearFrac: parseDateFrac('2015-APR-18'), cx: 89, cy: 194,
    note: 'Exercise- and allergen-triggered; ICS + LABA controller therapy.',
    evidence: 'Spirometry Apr 2015: FEV1/FVC 0.71; bronchodilator response +15%.',
  },
  {
    id: 'covid', system: 'pulm',
    label: 'COVID-19',
    medName: 'COVID-19, confirmed (ICD-10: U07.1)',
    localNames: { ja: '新型コロナウイルス感染症', es: 'COVID-19', 'zh-TW': '新冠肺炎' },
    date: '2022-FEB-17', yearFrac: parseDateFrac('2022-FEB-17'), cx: 171, cy: 194,
    note: 'Moderate; required O₂ supplementation briefly; full recovery by week 4.',
    evidence: 'PCR positive Feb 2022; chest X-ray bilateral ground-glass opacities.',
  },
  {
    id: 'gerd', system: 'gi',
    label: 'GERD',
    medName: 'Gastroesophageal reflux disease without esophagitis (ICD-10: K21.9)',
    localNames: { ja: '胃食道逆流症', es: 'Enfermedad por reflujo gastroesofágico', 'zh-TW': '胃食管反流病' },
    date: '2016-MAR-30', yearFrac: parseDateFrac('2016-MAR-30'), cx: 114, cy: 255,
    note: 'Typical heartburn; PPI therapy; lifestyle modifications advised.',
    evidence: 'Upper endoscopy Mar 2016: LA grade A.',
  },
  {
    id: 'ibs', system: 'gi',
    label: 'Irritable bowel syndrome',
    medName: 'Irritable bowel syndrome, mixed type (ICD-10: K58.2)',
    localNames: { ja: '過敏性腸症候群', es: 'Síndrome del intestino irritable', 'zh-TW': '腸易激綜合症' },
    date: '2017-AUG-15', yearFrac: parseDateFrac('2017-AUG-15'), cx: 148, cy: 310,
    note: 'Rome IV criteria met; low-FODMAP diet effective.',
    evidence: 'Gastroenterology consult Aug 2017; colonoscopy unremarkable.',
  },
  {
    id: 'stones', system: 'renal',
    label: 'Kidney stones',
    medName: 'Urolithiasis, calcium oxalate calculus (ICD-10: N20.0)',
    localNames: { ja: '尿路結石', es: 'Litiasis renal', 'zh-TW': '腎結石' },
    date: '2021-SEP-05', yearFrac: parseDateFrac('2021-SEP-05'), cx: 87, cy: 292,
    note: 'Left renal calculus 6 mm; passed spontaneously; hydration counselling.',
    evidence: 'CT KUB Sep 2021; urology follow-up.',
  },
  {
    id: 'uti', system: 'renal',
    label: 'Recurrent UTIs',
    medName: 'Recurrent acute cystitis (ICD-10: N30.0)',
    localNames: { ja: '再発性尿路感染症', es: 'Infecciones urinarias recurrentes', 'zh-TW': '復發性尿路感染' },
    date: '2020-APR-11', yearFrac: parseDateFrac('2020-APR-11'), cx: 130, cy: 415,
    note: '≥3 episodes/year; prophylactic low-dose nitrofurantoin initiated.',
    evidence: 'Urine cultures Apr 2020; urology review.',
  },
  {
    id: 'thyroid', system: 'endo',
    label: 'Hypothyroidism',
    medName: 'Hypothyroidism, primary, autoimmune (ICD-10: E03.9)',
    localNames: { ja: '甲状腺機能低下症', es: 'Hipotiroidismo', 'zh-TW': '甲狀腺功能減退症' },
    date: '2017-NOV-19', yearFrac: parseDateFrac('2017-NOV-19'), cx: 130, cy: 105,
    note: 'Hashimoto\'s; TSH 12.4 at diagnosis; levothyroxine 75 mcg daily.',
    evidence: 'TSH + anti-TPO antibodies Nov 2017.',
  },
  {
    id: 'vitd', system: 'endo',
    label: 'Vitamin D deficiency',
    medName: 'Vitamin D deficiency, unspecified (ICD-10: E55.9)',
    localNames: { ja: 'ビタミンD欠乏症', es: 'Deficiencia de vitamina D', 'zh-TW': '維生素D缺乏症' },
    date: '2015-JUL-08', yearFrac: parseDateFrac('2015-JUL-08'), cx: 162, cy: 105,
    note: '25-OH-D 14 ng/mL; cholecalciferol 2000 IU/day; corrected within 6 months.',
    evidence: 'Serum 25-OH vitamin D Jul 2015.',
  },
  {
    id: 'fibroid', system: 'repro',
    label: 'Uterine fibroids',
    medName: 'Uterine leiomyoma, intramural (ICD-10: D25.1)',
    localNames: { ja: '子宮筋腫', es: 'Fibromas uterinos', 'zh-TW': '子宮肌瘤' },
    date: '2020-JUN-22', yearFrac: parseDateFrac('2020-JUN-22'), cx: 130, cy: 402,
    note: 'Two intramural fibroids, largest 3.2 cm; monitoring with annual ultrasound.',
    evidence: 'Pelvic ultrasound Jun 2020; gynecology consult.',
  },
  {
    id: 'pcos', system: 'repro',
    label: 'Polycystic ovary syndrome',
    medName: 'Polycystic ovary syndrome (ICD-10: E28.2)',
    localNames: { ja: '多嚢胞性卵巣症候群', es: 'Síndrome de ovario poliquístico', 'zh-TW': '多囊卵巢綜合症' },
    date: '2016-OCT-29', yearFrac: parseDateFrac('2016-OCT-29'), cx: 148, cy: 392,
    note: 'Rotterdam criteria met: oligomenorrhea, hyperandrogenism, PCO on US.',
    evidence: 'Endocrinology + gynecology consult Oct 2016; fasting insulin elevated.',
  },
]
