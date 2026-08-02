import { ComponentProps, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated, Dimensions, Easing, GestureResponderEvent,
  KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native'
import { IS_WEB, IS_DESKTOP, S, fs, sc } from '@/lib/scale'
import { SETTINGS_CONTROL_GAP } from '@/lib/settingsLayout'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, {
  Circle, Ellipse, Line, Path as SvgPath, Rect,
} from 'react-native-svg'
import { Image } from 'expo-image'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { QSWordmark } from '@/components/QSWordmark'
import { GearIcon } from '@/components/GearIcon'
import { useAppStore } from '@/store/useAppStore'
import type { Gender, PendingUpload } from '@/store/useAppStore'
import { useConditions, useConditionRecords, useConditionDots } from '@/hooks/useConditions'
import {
  ALL_SYSTEMS, ConditionRecord, DesignCondition, SystemId,
  SYSTEM_META, SupportedLang, getLocalName, getSvgX, getSvgY, normalizeSystemId,
} from '@/model/conditions'
import { parseEvidence, formatDateDisplay } from '@/lib/support'
import { openQSWebsite } from '@/lib/links'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import {
  getIndexedSetting, putIndexedSetting, updateIndexedConditionPosition,
  getRecordImageThumbnail, getRecordImageBlob, type IndexedConditionDot,
  putIndexedConditionLocation, getConditionLocations, deleteConditionLocation, uuid,
} from '@/lib/db/indexedDb'
import { exportIndexedDbBackupToJson, importIndexedDbBackupFromJson } from '@/lib/db/indexedDbBackup'
import { ProviderSettings } from '@/components/ProviderSettings'
import { SettingsDropdown, type SettingsDropdownId } from '@/components/SettingsDropdown'
import { chatErrorCopyForKind } from '@/lib/llm/chatErrorCopy'
import { shouldShowFirstChatNudge } from '@/lib/llm/firstChatNudge'

const { height: SH } = Dimensions.get('window')

const C = {
  bg: '#0A0C14',
  surface: '#13171F',
  surfaceHigh: '#1A2333',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  inkDim: '#3D4E65',
  border: 'rgba(255,255,255,0.06)',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  purpleTint: 'rgba(112, 66, 214, 0.15)',
  aqua: '#1FC3A4',
  aquaDark: '#1A9E8A',
}

const STATIC_UI_ALPHA = 0.33
const STATIC_STROKE_ALPHA = 0.16
const STATIC_DARK_BG = `rgba(10,12,20,${STATIC_UI_ALPHA})`
const STATIC_STROKE_BG = `rgba(255,255,255,${STATIC_STROKE_ALPHA})`

const SUPPORTED_LANGS: {
  code: SupportedLang; flag: string; native: string; english: string
}[] = [
  { code: 'en', flag: '🇺🇸', native: 'English', english: 'English' },
  { code: 'zh-TW', flag: '🇹🇼', native: '中文（繁體）', english: 'Chinese (Traditional)' },
  { code: 'ja', flag: '🇯🇵', native: '日本語', english: 'Japanese' },
  { code: 'es', flag: '🇪🇸', native: 'Español', english: 'Spanish' },
]

// Log-scale helpers — vertical rail: bottom=oldest, top=newest
const K = 2.5
// Rail range is computed dynamically from conditions — 1 month padding on each end.
// Fallback values used only when conditions list is empty.
const FALLBACK_MIN = 2013
const FALLBACK_MAX = 2025
const MONTH_IDX_SHORT: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function toLinear(yearFrac: number, rMin: number, rMax: number): number {
  if (rMax <= rMin) return 1
  return clamp01((yearFrac - rMin) / (rMax - rMin))
}
function toTimelineFrac(yearFrac: number, rMin: number, rMax: number): number {
  const t = toLinear(yearFrac, rMin, rMax)
  return (Math.exp(K * t) - 1) / (Math.exp(K) - 1)
}

function fromTimelineFrac(frac: number): number {
  return Math.log(clamp01(frac) * (Math.exp(K) - 1) + 1) / K
}
function railEdgeGap(railH: number): number {
  return Math.min(sc(24), Math.max(sc(12), railH * 0.055))
}

function toVertPos(
  yearFrac: number,
  railH: number,
  rMin: number,
  rMax: number,
  dataMin = rMin,
  dataMax = rMax,
): number {
  if (dataMax <= dataMin || dataMin <= rMin || dataMax >= rMax) {
    return (1 - toTimelineFrac(yearFrac, rMin, rMax)) * railH
  }
  const gap = Math.min(railEdgeGap(railH), railH / 4)
  if (yearFrac <= dataMin) {
    return railH - gap * toLinear(yearFrac, rMin, dataMin)
  }
  if (yearFrac >= dataMax) {
    return gap * (1 - toLinear(yearFrac, dataMax, rMax))
  }
  return gap + (1 - toTimelineFrac(yearFrac, dataMin, dataMax)) * Math.max(1, railH - gap * 2)
}

function fromVertPos(
  posY: number,
  railH: number,
  rMin: number,
  rMax: number,
  dataMin = rMin,
  dataMax = rMax,
): number {
  if (railH <= 0) return rMax
  const y = Math.max(0, Math.min(railH, posY))
  if (dataMax > dataMin && dataMin > rMin && dataMax < rMax) {
    const gap = Math.min(railEdgeGap(railH), railH / 4)
    if (y >= railH - gap) {
      return rMin + ((railH - y) / gap) * (dataMin - rMin)
    }
    if (y <= gap) {
      return dataMax + ((gap - y) / gap) * (rMax - dataMax)
    }
    const frac = 1 - (y - gap) / Math.max(1, railH - gap * 2)
    const t = fromTimelineFrac(frac)
    return dataMin + t * (dataMax - dataMin)
  }
  const frac = 1 - y / railH
  const t = fromTimelineFrac(frac)
  return rMin + t * (rMax - rMin)
}

function clampRailYear(yearFrac: number, rMin: number, rMax: number): number {
  return Math.max(rMin, Math.min(rMax, yearFrac))
}

function conditionYear(c: DesignCondition, overrides: Record<string, string>): number {
  const override = overrides[c.id] ? parseFloat(overrides[c.id]) : NaN
  return Number.isFinite(override) ? override : c.yearFrac
}

function birthYearFrac(birthYear: number, birthMonth: string): number {
  const monthIndex = MONTH_IDX_SHORT[birthMonth] ?? 0
  return birthYear + monthIndex / 12
}

function railLowerLimit(oldestYear: number, birthYear: number, birthMonth: string): number {
  return Math.max(oldestYear - RAIL_RANGE_PAD_BEFORE, birthYearFrac(birthYear, birthMonth))
}

const DISCLAIMER = 'Educational only. Not medical advice. Never a substitute for professional clinical judgment.'

// Body-map zoom limits
const MIN_ZOOM = 1
const MAX_ZOOM = 5

// ─── Small SVG icons ──────────────────────────────────────────────────────────

function MailIcon({ color = C.aqua, size = fs(15) }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={2} stroke={color} strokeWidth={1.8} />
      <SvgPath d="M4 7l8 6 8-6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

function PhoneIcon({ color = C.aqua, size = fs(15) }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M6.6 3h3l1.5 4.5-2 1.3a12 12 0 005.8 5.8l1.3-2 4.5 1.5v3a2 2 0 01-2.2 2A17 17 0 014.6 5.2 2 2 0 016.6 3z"
        stroke={color} strokeWidth={1.6} fill="none"
      />
    </Svg>
  )
}

function ChatBubbleIcon({ color = '#fff', size = fs(14) }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M4 5h16v11H9l-4 4v-4H4z"
        stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round"
      />
    </Svg>
  )
}

function PencilIcon({ size = fs(13) }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke={C.inkMuted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      <SvgPath
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={C.inkMuted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </Svg>
  )
}

// ─── Record thumbnails (SVG, one per type) ───────────────────────────────────

// Lazily fetches a stored record image (thumbnail resolution) and renders it,
// falling back to the SVG placeholder art (passed in as `fallback`) while
// loading or on fetch error — no layout flash, since the fallback occupies
// the same w×h from the first render.
function RecordThumbImage({
  imageId, w, h, fallback,
}: {
  imageId: string
  w: number
  h: number
  fallback: ReactNode
}) {
  const idb = useOptionalIndexedDb()
  const [uri, setUri] = useState<string | null>(null)

  // Keyed by `imageId` at the call site below, so a change of image remounts
  // this component (fresh `uri: null` state) instead of resetting state
  // synchronously inside the effect body.
  useEffect(() => {
    if (!idb) return
    let cancelled = false
    let objectUrl: string | null = null
    getRecordImageThumbnail(idb, imageId)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUri(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [idb, imageId])

  if (!uri) return <>{fallback}</>
  return (
    <Image
      source={{ uri }}
      style={{ width: w, height: h, borderRadius: 6 }}
      contentFit="cover"
    />
  )
}

function renderRecordThumb(rec: ConditionRecord, w: number, h: number) {
  const svgThumb = renderRecordThumbSvg(rec, w, h)
  if (rec.imageId) {
    return <RecordThumbImage key={rec.imageId} imageId={rec.imageId} w={w} h={h} fallback={svgThumb} />
  }
  return svgThumb
}

function renderRecordThumbSvg(rec: ConditionRecord, w: number, h: number) {
  const col = rec.color
  switch (rec.type) {
    case 'TREND': {
      const grid = [0.28, 0.52, 0.76].map((f) => (
        <Line key={f} x1={4} y1={h * f} x2={w - 4} y2={h * f} stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
      ))
      const line = `M4 ${h * 0.7} C ${w * 0.25} ${h * 0.5}, ${w * 0.4} ${h * 0.78}, ${w * 0.55} ${h * 0.45} S ${w * 0.85} ${h * 0.22}, ${w - 4} ${h * 0.32}`
      const area = `${line} L ${w - 4} ${h - 4} L 4 ${h - 4} Z`
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#0B0F18" rx={6} />
          {grid}
          <SvgPath d={area} fill={col} fillOpacity={0.18} />
          <SvgPath d={line} stroke={col} strokeWidth={1.8} fill="none" />
        </Svg>
      )
    }
    case 'ECG': {
      const mid = h * 0.5
      const d = `M4 ${mid} L ${w * 0.18} ${mid} ` +
        `Q ${w * 0.2} ${mid - h * 0.08} ${w * 0.22} ${mid} ` + // P
        `L ${w * 0.3} ${mid} L ${w * 0.33} ${mid + h * 0.12} ` + // Q
        `L ${w * 0.36} ${mid - h * 0.4} ` + // R spike
        `L ${w * 0.39} ${mid + h * 0.18} L ${w * 0.43} ${mid} ` + // S
        `Q ${w * 0.5} ${mid - h * 0.12} ${w * 0.57} ${mid} ` + // T
        `L ${w - 4} ${mid}`
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#0B0F18" rx={6} />
          <Line x1={4} y1={mid} x2={w - 4} y2={mid} stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
          <SvgPath d={d} stroke={col} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
        </Svg>
      )
    }
    case 'IMAGING': {
      const cx = w / 2, cy = h / 2
      const scan = [0.3, 0.45, 0.6, 0.75].map((f) => (
        <Line key={f} x1={4} y1={h * f} x2={w - 4} y2={h * f} stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} />
      ))
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#06080E" rx={6} />
          <Ellipse cx={cx} cy={cy} rx={w * 0.32} ry={h * 0.36} stroke={col} strokeOpacity={0.55} strokeWidth={1.4} fill="none" />
          <Ellipse cx={cx} cy={cy} rx={w * 0.21} ry={h * 0.24} stroke={col} strokeOpacity={0.4} strokeWidth={1.2} fill="none" />
          <Ellipse cx={cx} cy={cy} rx={w * 0.1} ry={h * 0.12} fill={col} fillOpacity={0.3} />
          {scan}
        </Svg>
      )
    }
    case 'LABS': {
      const widths = [0.7, 0.45, 0.85, 0.55]
      const bars = widths.map((bw, i) => (
        <Rect
          key={i}
          x={6}
          y={h * (0.18 + i * 0.2)}
          width={(w - 12) * bw}
          height={h * 0.1}
          rx={2}
          fill={col}
          fillOpacity={0.55}
        />
      ))
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#0B0F18" rx={6} />
          {bars}
        </Svg>
      )
    }
    case 'SPIRO': {
      const loop = `M ${w * 0.2} ${h * 0.7} ` +
        `C ${w * 0.2} ${h * 0.3}, ${w * 0.55} ${h * 0.18}, ${w * 0.7} ${h * 0.35} ` +
        `C ${w * 0.85} ${h * 0.5}, ${w * 0.6} ${h * 0.82}, ${w * 0.4} ${h * 0.78} ` +
        `C ${w * 0.28} ${h * 0.76}, ${w * 0.2} ${h * 0.78}, ${w * 0.2} ${h * 0.7} Z`
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#0B0F18" rx={6} />
          <Line x1={w * 0.16} y1={h * 0.12} x2={w * 0.16} y2={h * 0.86} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
          <Line x1={w * 0.16} y1={h * 0.86} x2={w * 0.9} y2={h * 0.86} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
          <SvgPath d={loop} stroke={col} strokeWidth={1.6} fill={col} fillOpacity={0.12} />
        </Svg>
      )
    }
    case 'SCAN': {
      const cx = w * 0.42
      return (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#06080E" rx={6} />
          <Circle cx={cx} cy={h * 0.22} r={h * 0.1} stroke={col} strokeWidth={1.4} fill="none" />
          <SvgPath
            d={`M ${cx - w * 0.1} ${h * 0.34} L ${cx + w * 0.1} ${h * 0.34} L ${cx + w * 0.08} ${h * 0.66} L ${cx - w * 0.08} ${h * 0.66} Z`}
            stroke={col} strokeWidth={1.4} fill="none"
          />
          <Line x1={cx - w * 0.05} y1={h * 0.66} x2={cx - w * 0.07} y2={h * 0.9} stroke={col} strokeWidth={1.4} />
          <Line x1={cx + w * 0.05} y1={h * 0.66} x2={cx + w * 0.07} y2={h * 0.9} stroke={col} strokeWidth={1.4} />
          {[0.2, 0.4, 0.6, 0.8].map((f) => (
            <Line key={f} x1={w - 8} y1={h * f} x2={w - 4} y2={h * f} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          ))}
          <Line x1={w - 6} y1={h * 0.15} x2={w - 6} y2={h * 0.85} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
        </Svg>
      )
    }
    default:
      return <Svg width={w} height={h}><Rect x={0} y={0} width={w} height={h} fill="#0B0F18" rx={6} /></Svg>
  }
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function NavBar() {
  const {
    currentYear, timeDisplayMode, birthYear, birthMonth,
    toggleTimeDisplayMode, toggleSettings, toggleLegend, legendOpen,
    locationEditingCondition, locationEditMode, setLocationEditMode,
    finishLocationEditing, locationEditMessage, setLocationEditMessage, preferredLanguage,
    lastUploadResult, setLastUploadResult,
  } = useAppStore()
  const uploadMessage = lastUploadResult
    ? lastUploadResult.conditionCount > 0
      ? `${lastUploadResult.conditionCount} condition${lastUploadResult.conditionCount === 1 ? '' : 's'} added`
      : 'No conditions extracted'
    : null

  // Auto-dismiss the removal-rejection message after a brief interval.
  useEffect(() => {
    if (!locationEditMessage) return
    const timer = setTimeout(() => setLocationEditMessage(null), 2200)
    return () => clearTimeout(timer)
  }, [locationEditMessage, setLocationEditMessage])

  return (
    <View style={styles.nav}>
      <TouchableOpacity onPress={toggleLegend} hitSlop={12} style={styles.logoRow}>
        <Text style={styles.logoM}>m</Text>
        <Text style={styles.logoAI}>AI</Text>
        <Text style={styles.logoGenki}> Genki</Text>
        <View style={[styles.navChevronBox, legendOpen && styles.navChevronBoxOpen]}>
          <Svg width={fs(10)} height={fs(6)} viewBox="0 0 10 6" fill="none">
            <SvgPath d="M1 1L5 5L9 1" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      </TouchableOpacity>
      {uploadMessage && !locationEditingCondition && (
        <TouchableOpacity
          style={styles.navCenterMessage}
          onPress={() => setLastUploadResult(null)}
          hitSlop={8}
          activeOpacity={0.75}
        >
          <Text style={styles.navCenterMessageText} numberOfLines={1}>{uploadMessage}</Text>
        </TouchableOpacity>
      )}
      {locationEditingCondition && locationEditMessage && (
        <View style={styles.navCenterMessage} pointerEvents="none">
          <Text style={styles.navCenterMessageText} numberOfLines={1}>{locationEditMessage}</Text>
        </View>
      )}
      {locationEditingCondition ? (
        <View style={styles.navLocationEdit}>
          <Text
            style={[styles.navRelocationText, { color: SYSTEM_META[locationEditingCondition.system]?.color ?? C.aqua }]}
            numberOfLines={1}
          >
            {getLocalName(locationEditingCondition, preferredLanguage)}
          </Text>
          <View style={styles.navLocationEditControls}>
            <TouchableOpacity
              style={[styles.navLocationEditBtn, locationEditMode === 'add' && {
                backgroundColor: SYSTEM_META[locationEditingCondition.system]?.color ?? C.aqua,
              }]}
              onPress={() => setLocationEditMode('add')}
              hitSlop={6}
            >
              <Text style={styles.navLocationEditBtnText}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navLocationEditBtn, locationEditMode === 'remove' && {
                backgroundColor: SYSTEM_META[locationEditingCondition.system]?.color ?? C.aqua,
              }]}
              onPress={() => setLocationEditMode('remove')}
              hitSlop={6}
            >
              <Text style={styles.navLocationEditBtnText}>− Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navLocationEditBtn} onPress={finishLocationEditing} hitSlop={6}>
              <Text style={styles.navLocationEditBtnText}>✓ Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.navRight}>
          <TouchableOpacity style={styles.datePill} onPress={toggleTimeDisplayMode} hitSlop={8}>
            <Text style={styles.datePillText}>
              {formatDateDisplay(currentYear, timeDisplayMode, birthYear, birthMonth)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleSettings} hitSlop={12}>
            <GearIcon />
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ─── Legend Panel ────────────────────────────────────────────────────────────

function LegendPanel() {
  const { activeSystems, toggleSystem, soloSystem, legendOpen } = useAppStore()
  const { height: winH } = useWindowDimensions()

  // Responsive sizing: shrink the legend so all rows fit between the nav bar and
  // the bottom of the viewport as the window gets shorter. Never larger than the
  // desktop scale S, never smaller than 1× (mobile baseline).
  const ROWS = ALL_SYSTEMS.length
  // Row ≈ label line-box (fontSize × 1.4) + vertical padding; plus inner pad and
  // one row of slack so the whole legend (incl. the last "Reproductive" row) is
  // always allowed to fit between the nav and the viewport bottom.
  const rowH1x = Math.ceil(12 * 1.4) + 1.5 * 2
  const naturalH = rowH1x * (ROWS + 1) + 8 * 2
  const navH = 40 * S
  const avail = winH - navH - 24
  const lscale = Math.max(1, Math.min(S, avail / naturalH))

  const labelFs = Math.round(12 * lscale)
  const dotSz = Math.round(8 * lscale)
  const rowPadV = Math.round(1.5 * lscale)
  const innerPadV = Math.round(8 * lscale)
  const innerPadH = Math.round(12 * lscale)
  const rowGap = Math.round(8 * lscale)
  // Open height from the same scaled metrics we render, with a full extra row of
  // slack so the last row is never clipped by the animated maxHeight.
  const rowH = Math.ceil(labelFs * 1.4) + rowPadV * 2
  const contentH = rowH * (ROWS + 1) + innerPadV * 2

  const [maxH] = useState(() => new Animated.Value(legendOpen ? contentH : 0))
  useEffect(() => {
    Animated.timing(maxH, {
      toValue: legendOpen ? contentH : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [legendOpen, contentH, maxH])

  return (
    <Animated.View style={[styles.legendPanel, { maxHeight: maxH, pointerEvents: legendOpen ? 'auto' : 'none' }]}>
      <View style={[styles.legendInner, { paddingVertical: innerPadV, paddingHorizontal: innerPadH }]}>
        {ALL_SYSTEMS.map((id) => {
          const active = activeSystems.includes(id)
          const meta = SYSTEM_META[id]
          return (
            <View
              key={id}
              style={[styles.legendRow, { paddingVertical: rowPadV, gap: rowGap }]}
            >
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: rowGap, flex: 1 }}
                onPress={() => toggleSystem(id)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.legendDot,
                  { width: dotSz, height: dotSz, borderRadius: dotSz / 2, backgroundColor: meta.color },
                  !active && { opacity: 0.3 },
                ]} />
                <Text style={[styles.legendLabel, { fontSize: labelFs }, !active && { opacity: 0.4 }]}>
                  {meta.label}
                </Text>
              </TouchableOpacity>
              {/* Solo toggle: shows only this layer; tap again to restore all */}
              <TouchableOpacity
                onPress={() => soloSystem(id)}
                hitSlop={6}
                style={[
                  styles.legendOnlyBtn,
                  { borderColor: meta.color },
                  !active && { opacity: 0.3 },
                ]}
              >
                <Text style={[styles.legendOnlyText, { fontSize: Math.round(labelFs * 0.58), color: meta.color }]}>only</Text>
              </TouchableOpacity>
            </View>
          )
        })}
      </View>
    </Animated.View>
  )
}

// ─── Body SVG ─────────────────────────────────────────────────────────────────

// Colorized 2D anatomy layers, keyed by system. Filenames are NN-{system}.png
// where NN is the legend order. Metro needs static require() paths, so this is
// an explicit map. Reproductive currently ships male-only (no -f layer yet).
const COLORIZED_LAYERS: Record<SystemId, ComponentProps<typeof Image>['source']> = {
  integumentary: require('../../assets/maigenki-systems-2colorized/00-integumentary.png'),
  muscular: require('../../assets/maigenki-systems-2colorized/01-muscular.png'),
  skeletal: require('../../assets/maigenki-systems-2colorized/02-skeletal.png'),
  cardiovascular: require('../../assets/maigenki-systems-2colorized/03-cardiovascular.png'),
  nervous: require('../../assets/maigenki-systems-2colorized/04-nervous.png'),
  digestive: require('../../assets/maigenki-systems-2colorized/05-digestive.png'),
  respiratory: require('../../assets/maigenki-systems-2colorized/06-respiratory.png'),
  renal: require('../../assets/maigenki-systems-2colorized/07-renal.png'),
  lymphatic: require('../../assets/maigenki-systems-2colorized/08-lymphatic.png'),
  endocrine: require('../../assets/maigenki-systems-2colorized/09-endocrine.png'),
  reproductive: require('../../assets/maigenki-systems-2colorized/10-reproductive-m.png'),
}

// Stacks the colorized PNG layers for the active systems, in legend order
// (integumentary at the back → reproductive on top). Each layer is a transparent
// full-body PNG so they composite naturally.
function BodyLayers({ activeSystems }: { activeSystems: SystemId[] }) {
  return (
    <>
      {ALL_SYSTEMS.filter((id) => activeSystems.includes(id)).map((id) => (
        <Image
          key={id}
          source={COLORIZED_LAYERS[id]}
          style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
          contentFit="contain"
          pointerEvents="none"
        />
      ))}
    </>
  )
}

// Permanent faded dots: show all conditions regardless of current time, 30% opacity.
// Clicking has the same effect as the interactive dots (snaps rail + opens condition sheet).
//
// The SVG is purely visual (pointerEvents="none"). A separate transparent View / Pressable
// layered on top owns all click/press events and uses "find nearest dot within 8 SVG units"
// to identify which condition was intended. This eliminates both (a) overlapping hit areas
// between tightly-clustered dots and (b) SVG z-order eclipsing where a higher-layer dot's
// hit area would block a lower-layer dot from ever being reachable.
function GhostDots({
  dots, conditions, activeSystems, onPress,
  locationEditMode, locationEditingConditionId, onLocationAdd, onLocationRemoveAttempt,
}: {
  dots: IndexedConditionDot[]
  conditions: DesignCondition[]
  activeSystems: SystemId[]
  onPress: (c: DesignCondition) => void
  locationEditMode?: 'add' | 'remove' | null
  locationEditingConditionId?: string | null
  onLocationAdd?: (cx: number, cy: number) => void
  onLocationRemoveAttempt?: (dot: IndexedConditionDot) => void
}) {
  const visible = dots.filter((d) => activeSystems.includes(normalizeSystemId(d.system)))
  const [nativeSize, setNativeSize] = useState({ w: 260, h: 460 })

  // "Nearest dot within 8 SVG units" lookup, optionally scoped to a single
  // condition (used by the Remove tool so other conditions' dots stay inert).
  const findNearest = useCallback((svgX: number, svgY: number, conditionId?: string) => {
    let nearest: IndexedConditionDot | null = null
    let minDist = 8  // SVG units — must click within this radius of a dot
    for (const d of visible) {
      if (conditionId && d.conditionId !== conditionId) continue
      const dist = Math.hypot(getSvgX(d.cx_percent) - svgX, getSvgY(d.cy_percent) - svgY)
      if (dist < minDist) { minDist = dist; nearest = d }
    }
    return nearest
  }, [visible])

  // Resolves the tapped dot's conditionId back to the full DesignCondition
  // (from the parallel useConditions()-sourced list) at press time — the two
  // lists are joined by id here, not merged (Task 5.3).
  const pressNearest = useCallback((svgX: number, svgY: number) => {
    const nearest = findNearest(svgX, svgY)
    if (nearest) {
      const cond = conditions.find((c) => c.id === nearest.conditionId)
      if (cond) onPress(cond)
    }
  }, [findNearest, conditions, onPress])

  const handleTap = useCallback((svgX: number, svgY: number) => {
    if (locationEditMode === 'add' && onLocationAdd) { onLocationAdd(svgX, svgY); return }
    if (locationEditMode === 'remove' && onLocationRemoveAttempt) {
      const nearest = findNearest(svgX, svgY, locationEditingConditionId ?? undefined)
      if (nearest) onLocationRemoveAttempt(nearest)
      return
    }
    pressNearest(svgX, svgY)
  }, [locationEditMode, onLocationAdd, onLocationRemoveAttempt, locationEditingConditionId, findNearest, pressNearest])

  return (
    <>
      {/* Visual layer: ghost dots at 30% opacity, no pointer events */}
      <Svg
        width="100%" height="100%" viewBox="0 0 260 460"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {visible.map((d) => {
          const isInferred = d.status === 'inferred'
          const color = SYSTEM_META[normalizeSystemId(d.system)]?.color ?? '#fff'
          return (
            <Circle
              key={`${d.conditionId}:${d.cx_percent}:${d.cy_percent}`} cx={getSvgX(d.cx_percent)} cy={getSvgY(d.cy_percent)} r={1.5}
              fill={isInferred ? 'none' : color} fillOpacity={isInferred ? undefined : 0.3}
              stroke={isInferred ? color : 'none'}
              strokeWidth={isInferred ? 1 : 0}
              strokeOpacity={isInferred ? 0.3 : undefined}
              strokeDasharray={isInferred ? '1.2,1' : undefined}
              pointerEvents="none"
            />
          )
        })}
      </Svg>
      {/* Click-handling layer: outside the SVG to avoid SVG pointer-events fragility */}
      {IS_WEB ? (
        <View
          style={StyleSheet.absoluteFill}
          {...({
            onClick: (e: any) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const svgX = (e.clientX - rect.left) * 260 / rect.width
              const svgY = (e.clientY - rect.top) * 460 / rect.height
              handleTap(svgX, svgY)
            },
          } as object)}
        />
      ) : (
        <Pressable
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout
            setNativeSize({ w: width, h: height })
          }}
          onPress={(e) => {
            const svgX = (e.nativeEvent.locationX / nativeSize.w) * 260
            const svgY = (e.nativeEvent.locationY / nativeSize.h) * 460
            handleTap(svgX, svgY)
          }}
        />
      )}
    </>
  )
}

function BodySvg({
  activeSystems, dots, onConditionPress, currentYear,
  condDateOverrides, selectedCondition, locationEditingCondition,
}: {
  activeSystems: SystemId[]
  dots: IndexedConditionDot[]
  onConditionPress: (c: DesignCondition) => void
  currentYear: number
  condDateOverrides: Record<string, string>
  selectedCondition: DesignCondition | null
  locationEditingCondition: DesignCondition | null
}) {
  const visibleDots = dots.filter((d) => {
    if (!activeSystems.includes(normalizeSystemId(d.system))) return false
    const override = condDateOverrides[d.conditionId]
    const frac = override ? parseFloat(override) : d.yearFrac
    return frac <= currentYear
  })

  return (
    <Svg width="100%" height="100%" viewBox="0 0 260 460" style={styles.bodySvg} pointerEvents="box-none">
      {/* Condition hotspot dots. On web pass a raw onClick (flows through to the
          DOM <g>) instead of onPress — onPress makes react-native-svg attach its
          touchable responder handlers, which leak to the DOM as "Unknown event
          handler property". On native, use onPress. */}
      {visibleDots.map((d) => {
        const isSelected = selectedCondition?.id === d.conditionId
        const isEditingLocation = locationEditingCondition?.id === d.conditionId
        const isInferred = d.status === 'inferred'
        const color = SYSTEM_META[normalizeSystemId(d.system)]?.color ?? '#fff'
        return (
          <Circle
            key={`${d.conditionId}:${d.cx_percent}:${d.cy_percent}`} cx={getSvgX(d.cx_percent)} cy={getSvgY(d.cy_percent)}
            r={isEditingLocation ? 4 : isSelected ? 2.5 : 1.5}
            fill={isInferred ? 'none' : color}
            stroke={isInferred ? color : 'none'}
            strokeWidth={isInferred ? 1 : 0}
            strokeDasharray={isInferred ? '1.2,1' : undefined}
            pointerEvents="none"
          />
        )
      })}
    </Svg>
  )
}

// ─── Condition ripple ────────────────────────────────────────────────────────

// One radiating ring, per the Claude Design pulse-ring reference: scale 1→2.4,
// opacity 0.25→0, 2.2s ease-out, looping. `delay` phase-shifts the second ring.
function RippleRing({ color, delay, size }: { color: string; delay: number; size: number }) {
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const loop = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: !IS_WEB,
        }),
      ),
    ])
    loop.start()
    return () => loop.stop()
  }, [anim, delay])
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: -size / 2, top: -size / 2,
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
      }}
    />
  )
}

// Radiating ripple over each condition dot whose marker the time rail is
// currently snapped to, so the user can spot where the condition sits.
function ConditionRipples({
  dots, activeSystems, currentYear, condDateOverrides,
}: {
  dots: IndexedConditionDot[]
  activeSystems: SystemId[]
  currentYear: number
  condDateOverrides: Record<string, string>
}) {
  const snapped = dots.filter((d) => {
    if (!activeSystems.includes(normalizeSystemId(d.system))) return false
    const frac = condDateOverrides[d.conditionId] ? parseFloat(condDateOverrides[d.conditionId]) : d.yearFrac
    return Math.abs(frac - currentYear) < 1e-9
  })
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {snapped.map((d) => (
        <View
          key={`${d.conditionId}:${d.cx_percent}:${d.cy_percent}`}
          style={{
            position: 'absolute',
            left: `${d.cx_percent}%`,
            top: `${d.cy_percent}%`,
            width: 0, height: 0,
          }}
        >
          <RippleRing color={SYSTEM_META[normalizeSystemId(d.system)]?.color ?? '#fff'} delay={0} size={sc(30)} />
          <RippleRing color={SYSTEM_META[normalizeSystemId(d.system)]?.color ?? '#fff'} delay={700} size={sc(30)} />
          <RippleRing color={SYSTEM_META[normalizeSystemId(d.system)]?.color ?? '#fff'} delay={1400} size={sc(30)} />
        </View>
      ))}
    </View>
  )
}

// ─── Vertical Time Rail ──────────────────────────────────────────────────────

// Desktop keeps the slim interactive rail; on any touch viewport (native or mobile web)
// the rail is always expanded so it's draggable without a prior tap.
const RAIL_W_INACTIVE = IS_DESKTOP ? sc(14) : sc(18)
const RAIL_W_ACTIVE   = IS_DESKTOP ? sc(18) : sc(18)
const RAIL_RANGE_PAD_BEFORE = 2 / 12
const RAIL_RANGE_PAD_AFTER = 1 / 12
const RAIL_SNAP_THRESHOLD_RATIO = 0.01

function VerticalTimeRail({ conditions }: { conditions: DesignCondition[] }) {
  const {
    currentYear, setCurrentYear, activeSystems,
    condDateOverrides, timeRailActive, setTimeRailActive,
    timeDisplayMode, birthYear, birthMonth, selectedCondition,
  } = useAppStore()

  const [railH, setRailH] = useState(SH * 0.6)
  // True only while the thumb is being actively dragged — gates the date/age label
  // so it appears exclusively during a drag, not at rest.
  const [dragging, setDragging] = useState(false)
  const [widthAnim] = useState(() => new Animated.Value(IS_WEB ? RAIL_W_ACTIVE : RAIL_W_INACTIVE))
  const didDrag = useRef(false)
  const wasActiveOnGrant = useRef(false)
  const railRef = useRef<View>(null)
  const railTopRef = useRef(0)

  const railYears = conditions
    .map((c) => conditionYear(c, condDateOverrides))
    .filter((year) => Number.isFinite(year))
  // Dynamic range: leave 2 months before earliest and 1 month after latest,
  // without extending earlier than the user's birth month.
  const railMin = railYears.length > 0
    ? railLowerLimit(Math.min(...railYears), birthYear, birthMonth)
    : FALLBACK_MIN
  const railMax = railYears.length > 0
    ? Math.max(...railYears) + RAIL_RANGE_PAD_AFTER
    : FALLBACK_MAX
  const dataMin = railYears.length > 0 ? Math.min(...railYears) : railMin
  const dataMax = railYears.length > 0 ? Math.max(...railYears) : railMax

  // On web the rail is always expanded — never collapses.
  useEffect(() => {
    if (IS_WEB) setTimeRailActive(true)
  }, [setTimeRailActive])

  function animateWidth(toValue: number) {
    Animated.timing(widthAnim, { toValue, duration: 220, useNativeDriver: false }).start()
  }
  function activateRail() {
    animateWidth(RAIL_W_ACTIVE)
    setTimeRailActive(true)
  }
  function deactivateRail() {
    if (IS_WEB) return // web rail stays open
    animateWidth(RAIL_W_INACTIVE)
    setTimeRailActive(false)
  }

  function snapToNearest(posY: number) {
    // Clamp the cursor to the rail so the thumb tracks the mouse exactly while dragging.
    const clampedY = Math.max(0, Math.min(railH, posY))
    const rawYear = clampRailYear(
      fromVertPos(clampedY, railH, railMin, railMax, dataMin, dataMax),
      railMin,
      railMax,
    )
    const visible = conditions
      .filter((c) => activeSystems.includes(c.system))
      .map((c) => conditionYear(c, condDateOverrides))
      .filter((year) => Number.isFinite(year))
    if (visible.length === 0) {
      setCurrentYear(rawYear)
      return
    }
    let nearestFrac = visible[0]
    let minPxDist = Infinity
    for (const cFrac of visible) {
      const pxDist = Math.abs(toVertPos(cFrac, railH, railMin, railMax, dataMin, dataMax) - clampedY)
      if (pxDist < minPxDist) { minPxDist = pxDist; nearestFrac = cFrac }
    }
    const threshold = railH * RAIL_SNAP_THRESHOLD_RATIO
    setCurrentYear(clampRailYear(minPxDist <= threshold ? nearestFrac : rawYear, railMin, railMax))
  }

  // Window-level drag listeners (web). react-native-web's responder stops
  // emitting onResponderMove once the cursor leaves the narrow rail, so we
  // listen on window instead: the thumb follows the mouse anywhere on screen
  // until the button is released. snapRef keeps the latest closure (railH etc.).
  const snapRef = useRef(snapToNearest)
  const activateRef = useRef(activateRail)
  useEffect(() => {
    snapRef.current = snapToNearest
    activateRef.current = activateRail
  })

  // Web drag is driven entirely by DOM listeners (no RN responder props, which
  // react-native-web does not consume on Animated.View and would leak to the
  // DOM as "Unknown event handler property"). mousedown starts the drag; window
  // move/up keep it following the cursor anywhere on screen until release.
  useEffect(() => {
    if (!IS_WEB) return
    const node = railRef.current as unknown as HTMLElement | null
    if (!node?.addEventListener) return
    // ── Mouse (desktop) ──
    const onMove = (ev: MouseEvent) => {
      didDrag.current = true
      snapRef.current(ev.clientY - railTopRef.current)
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    const onDown = (ev: MouseEvent) => {
      didDrag.current = false
      setDragging(true)
      railTopRef.current = node.getBoundingClientRect().top
      activateRef.current()
      snapRef.current(ev.clientY - railTopRef.current)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    // ── Touch (mobile web) ── mobile browsers don't synthesize mouse events during
    // a drag, so the rail needs its own touch listeners. preventDefault stops the
    // page from scrolling while the thumb tracks the finger.
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return
      ev.preventDefault()
      didDrag.current = true
      snapRef.current(ev.touches[0].clientY - railTopRef.current)
    }
    const onTouchEnd = () => {
      setDragging(false)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return
      ev.preventDefault()
      didDrag.current = false
      setDragging(true)
      railTopRef.current = node.getBoundingClientRect().top
      activateRef.current()
      snapRef.current(ev.touches[0].clientY - railTopRef.current)
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      window.addEventListener('touchend', onTouchEnd)
      window.addEventListener('touchcancel', onTouchEnd)
    }
    node.addEventListener('mousedown', onDown)
    node.addEventListener('touchstart', onTouchStart, { passive: false })
    return () => {
      node.removeEventListener('mousedown', onDown)
      node.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  const thumbTop = toVertPos(
    clampRailYear(currentYear, railMin, railMax),
    railH,
    railMin,
    railMax,
    dataMin,
    dataMax,
  )
  const railLabelH = fs(9) + sc(4)
  const railLabelTop = Math.max(0, Math.min(railH - railLabelH, thumbTop - railLabelH / 2))

  return (
    <Animated.View
      ref={railRef}
      style={[styles.railWrap, { width: widthAnim }]}
      onLayout={(e) => setRailH(e.nativeEvent.layout.height)}
      // Responder props are native-only: react-native-web does not consume them
      // on Animated.View (they would leak to the DOM as "Unknown event handler
      // property"). Web drag is handled by the DOM mousedown/window listeners in
      // the effect above instead.
      {...(IS_WEB ? {} : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: (e: GestureResponderEvent) => {
          wasActiveOnGrant.current = timeRailActive
          didDrag.current = false
          setDragging(true)
          activateRail()
          snapToNearest(e.nativeEvent.locationY)
        },
        onResponderMove: (e: GestureResponderEvent) => {
          didDrag.current = true
          snapToNearest(e.nativeEvent.locationY)
        },
        // tap on already-active rail collapses it; drag also collapses on release
        onResponderRelease: () => {
          setDragging(false)
          if (didDrag.current || wasActiveOnGrant.current) deactivateRail()
        },
        onResponderTerminate: () => { setDragging(false); deactivateRail() },
      })}
    >
      <View style={styles.railTrack} />
      {conditions
        .filter((c) => activeSystems.includes(c.system))
        .map((c) => {
          const frac = conditionYear(c, condDateOverrides)
          const top = toVertPos(frac, railH, railMin, railMax, dataMin, dataMax)
          const isSelected = selectedCondition?.id === c.id
          return (
            <View
              key={c.id}
              style={[
                styles.railDash,
                {
                  top: top - 1,
                  backgroundColor: SYSTEM_META[c.system]?.color ?? '#fff',
                  opacity: isSelected ? 1 : 0.7,
                },
              ]}
            />
          )
        })}
      <View style={[styles.railThumb, { top: thumbTop - sc(4) }]} />
      {dragging && (
        <View style={[styles.railLabel, { top: railLabelTop, pointerEvents: 'none' }]}>
          <Text style={styles.railLabelText} numberOfLines={1}>
            {formatDateDisplay(currentYear, timeDisplayMode, birthYear, birthMonth)}
          </Text>
        </View>
      )}
    </Animated.View>
  )
}

// ─── Records Carousel ─────────────────────────────────────────────────────────

function RecordsCarousel({ records }: { records: ConditionRecord[] }) {
  const { selectedRecords, setSelectedRecords, setLightboxRecord } = useAppStore()

  return (
    <ScrollView
      horizontal
      pagingEnabled={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carouselContent}
      style={styles.carousel}
    >
      {records.map((rec) => {
        const isSel = selectedRecords.some((r) => r.id === rec.id)
        return (
          <Pressable
            key={rec.id}
            onPress={() => {
              setLightboxRecord(rec)
              setSelectedRecords([rec])
            }}
            style={[
              styles.recordCard,
              {
                backgroundColor: isSel ? rec.color + '18' : 'rgba(255,255,255,0.04)',
                borderColor: isSel ? rec.color : 'rgba(255,255,255,0.12)',
              },
              isSel && (IS_WEB
                ? { boxShadow: `0 0 ${sc(8)}px ${rec.color}` }
                : { shadowColor: rec.color, shadowRadius: 8, shadowOpacity: 0.4, elevation: 4 }),
            ]}
          >
            {renderRecordThumb(rec, sc(117), sc(44))}
            <View style={styles.recordCardFooter}>
              <Text style={styles.recordCardLabel} numberOfLines={1}>{rec.label}</Text>
              <Text style={styles.recordCardDate} numberOfLines={1}>{rec.date}</Text>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.()
                setSelectedRecords(
                  isSel
                    ? selectedRecords.filter((r) => r.id !== rec.id)
                    : [...selectedRecords, rec],
                )
              }}
              hitSlop={8}
              style={[
                styles.recordSelCircle,
                { borderColor: rec.color, backgroundColor: isSel ? rec.color : 'transparent' },
              ]}
            >
              {isSel && (
                <Svg width={sc(9)} height={sc(9)} viewBox="0 0 12 12">
                  <SvgPath d="M2 6 L5 9 L10 3" stroke="#fff" strokeWidth={2} fill="none" />
                </Svg>
              )}
            </Pressable>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

// ─── Condition Sheet ──────────────────────────────────────────────────────────

function ConditionSheet() {
  const insets = useSafeAreaInsets()
  const {
    selectedCondition, sheetOpen, closeSheet,
    chatOpen, setChatOpen, chatMessages, addChatMessage,
    chatInputVal, setChatInputVal, chatLoading, setChatLoading,
    preferredLanguage, selectedRecords,
    condDateOverrides, editingCondDate, editDateInput,
    startEditDate, setEditDateInput, confirmEditDate, cancelEditDate,
    startLocationEditing, setOpenSettingsSection, llmTier,
  } = useAppStore()

  const idb = useOptionalIndexedDb()
  const condRecords = useConditionRecords(selectedCondition?.id)

  const [sheetTranslateY] = useState(() => new Animated.Value(1)) // 1 = off-screen
  const disclaimerShown = useRef(false)
  const [firstChatNudgeVisible, setFirstChatNudgeVisible] = useState(false)
  const firstChatNudgeChecked = useRef(false)

  useEffect(() => {
    Animated.timing(sheetTranslateY, {
      toValue: sheetOpen ? 0 : 1,
      duration: 420,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      // '%' output range below can't run on the native driver; JS-driven here.
      useNativeDriver: false,
    }).start()
  }, [sheetTranslateY, sheetOpen])

  // Disclaimer must precede the first chat message every session (cannot be
  // permanently dismissed). Tracked with a ref so it resets each session (on
  // remount) without triggering an extra render.
  useEffect(() => {
    if (chatOpen && sheetOpen && !disclaimerShown.current) {
      addChatMessage({ role: 'assistant', content: DISCLAIMER })
      disclaimerShown.current = true
    }
  }, [chatOpen, sheetOpen, addChatMessage])

  // First-chat-use upgrade nudge (lmfPlan.md A1 trigger 3, Phase 6): purely
  // additive to the disclaimer above — never gates or reorders it. Checked
  // once per sheet mount so re-renders don't re-query settings.
  useEffect(() => {
    if (!chatOpen || !idb || firstChatNudgeChecked.current) return
    firstChatNudgeChecked.current = true
    ;(async () => {
      const [seenFlag, dismissedAt] = await Promise.all([
        getIndexedSetting(idb, 'lmf_first_chat_nudge_seen'),
        getIndexedSetting(idb, 'lmf_nudge_dismissed_at'),
      ])
      if (shouldShowFirstChatNudge(llmTier, seenFlag, dismissedAt, new Date())) {
        setFirstChatNudgeVisible(true)
      }
    })()
  }, [chatOpen, idb, llmTier])

  async function dismissFirstChatNudge() {
    setFirstChatNudgeVisible(false)
    if (!idb) return
    await putIndexedSetting(idb, 'lmf_first_chat_nudge_seen', 'true')
    await putIndexedSetting(idb, 'lmf_nudge_dismissed_at', new Date().toISOString())
  }

  const sheetH = chatOpen
    ? Math.min(sc(780), SH * 0.92)
    : Math.min(sc(400), SH * 0.8)
  const translateY = sheetTranslateY.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '110%'],
  })

  async function sendMessage() {
    if (!chatInputVal.trim() || chatLoading) return
    const userMsg = chatInputVal.trim()
    setChatInputVal('')
    addChatMessage({ role: 'user', content: userMsg })
    setChatLoading(true)
    try {
      const { lmfChat } = await import('@/lib/llm/service')
      const cond = selectedCondition
      const selRecs = selectedRecords
      const sys = [
        'You are a concise medical information assistant for mAI Genki.',
        cond ? `The user is asking about ${cond.label} (${cond.medName}).` : '',
        selRecs.length
          ? `The user is referencing ${selRecs.length} record(s): ${selRecs.map((r) => `${r.type} "${r.label}" (${r.date})`).join(', ')}.`
          : '',
        'Answer in 1–3 short sentences. Always recommend consulting a healthcare provider.',
        DISCLAIMER,
      ].filter(Boolean).join(' ')
      const apiKey = idb ? (await getIndexedSetting(idb, 'openrouter_api_key')) ?? '' : ''
      const outcome = await lmfChat(sys, userMsg, { apiKey, db: idb ?? undefined })
      if (outcome.ok) {
        addChatMessage({ role: 'assistant', content: outcome.content })
      } else {
        const kind = useAppStore.getState().lastLlmFailureKind
        const { message, showConnectChip } = chatErrorCopyForKind(kind)
        addChatMessage({ role: 'assistant', content: message, showConnectChip })
      }
    } catch {
      addChatMessage({ role: 'assistant', content: 'Unable to connect. Check network and LLM access.' })
    } finally {
      setChatLoading(false)
    }
  }

  const localName = selectedCondition ? getLocalName(selectedCondition, preferredLanguage) : ''
  const meta = selectedCondition ? SYSTEM_META[selectedCondition.system] : null
  const ev = selectedCondition ? parseEvidence(selectedCondition.evidence) : null
  const displayDate = selectedCondition
    ? (condDateOverrides[selectedCondition.id] ?? selectedCondition.date)
    : ''

  const placeholder = selectedRecords.length > 0
    ? 'Ask about selected record…'
    : selectedCondition
      ? `Ask about ${localName}…`
      : 'Ask about your health…'

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetH,
          borderTopLeftRadius: chatOpen ? 0 : 18,
          borderTopRightRadius: chatOpen ? 0 : 18,
          paddingBottom: insets.bottom + 12,
          transform: [{ translateY }],
          pointerEvents: sheetOpen ? 'auto' : 'none',
        },
      ]}
    >
      {/* Header. Chat mode keeps the condition name (compressed); the detail
          card shows only the organ-system label here, since the condition name
          appears once in the large title below — no repeating it. */}
      <View style={styles.sheetHeader}>
        {meta && <View style={[styles.sysDot, { backgroundColor: meta.color }]} />}
        <View style={{ flex: 1 }}>
          {chatOpen ? (
            <>
              <Text style={styles.sheetCondName} numberOfLines={1}>
                {selectedCondition ? localName : 'Health assistant'}
              </Text>
              {selectedCondition && (
                <Text style={styles.sheetCondSub} numberOfLines={1}>
                  {preferredLanguage !== 'en' ? `${selectedCondition.label} · ` : ''}{selectedCondition.medName}
                </Text>
              )}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(8) }}>
              <Text
                style={[styles.sheetSysLabel, meta && { color: meta.color }]}
                numberOfLines={1}
              >
                {meta ? meta.label.toUpperCase() : 'HEALTH ASSISTANT'}
              </Text>
              {selectedCondition && meta && (
                <TouchableOpacity
                  onPress={() => startLocationEditing(selectedCondition)}
                  hitSlop={10}
                >
                  <PencilIcon />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={closeSheet} hitSlop={12}>
          <Text style={styles.sheetCloseBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Image/chart timeline — persistent whenever a condition is selected and
          the sheet is open, independent of chat state (Task 5.4). */}
      {selectedCondition && condRecords.length > 0 && <RecordsCarousel records={condRecords} />}

      {!chatOpen && selectedCondition && (
        <>
          {/* Common name in the preferred language; English common + full name
              beneath (only when the preferred language isn't English, where the
              title already is the English common name). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(8) }}>
            <Text style={styles.sheetCondNameLarge}>{localName}</Text>
            {selectedCondition.status === 'inferred' && (
              <View style={styles.inferredBadge}>
                <Text style={styles.inferredBadgeText}>Inferred</Text>
              </View>
            )}
          </View>
          <Text style={styles.sheetCondSubEn}>
            {preferredLanguage !== 'en'
              ? `${selectedCondition.label} · ${selectedCondition.medName}`
              : selectedCondition.medName}
          </Text>

          {/* Inline date editor */}
          <View style={styles.sheetDateRow}>
            {editingCondDate === selectedCondition.id ? (
              <View style={styles.dateEditRow}>
                <TextInput
                  style={styles.dateEditInput}
                  value={editDateInput}
                  onChangeText={setEditDateInput}
                  placeholder="YYYY-MMM-DD"
                  placeholderTextColor={C.inkMuted}
                  autoFocus
                />
                <TouchableOpacity onPress={confirmEditDate} hitSlop={8} style={styles.dateEditBtn}>
                  <Text style={styles.dateEditConfirm}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={cancelEditDate} hitSlop={8} style={styles.dateEditBtn}>
                  <Text style={styles.dateEditCancel}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dateViewRow}>
                <View style={styles.sheetDateChip}>
                  <Text style={styles.sheetDateText}>📅 First noted {displayDate}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => startEditDate(selectedCondition.id, displayDate)}
                  hitSlop={8}
                  style={styles.datePencilBtn}
                >
                  <PencilIcon />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Text style={styles.sheetNote}>{selectedCondition.note}</Text>

          {/* Source block — 3 lines */}
          {ev && (
            <View style={styles.sourceBlock}>
              <Text style={styles.sourceLine1}>
                <Text style={styles.sourceLabel}>SOURCE</Text>
                <Text style={styles.sourceMeta}>{`  ·  ${ev.location}`}</Text>
              </Text>
              <Text style={styles.sourceLine2}>{ev.institution}</Text>
              <View style={styles.sourceLine3}>
                <Text style={styles.sourceDoctor}>{ev.doctor}</Text>
                <View style={styles.sourceIcons}>
                  <MailIcon />
                  <PhoneIcon />
                </View>
              </View>
            </View>
          )}

          {/* Footer row — chat button */}
          <View style={styles.sheetFooterRow}>
            <TouchableOpacity style={styles.chatFooterBtn} onPress={() => setChatOpen(true)}>
              <ChatBubbleIcon />
            </TouchableOpacity>
          </View>
        </>
      )}

      {chatOpen && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
            {chatMessages.map((msg, i) => (
              <View
                key={i}
                style={[styles.chatBubble, msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssist]}
              >
                <Text style={[styles.chatBubbleText, msg.role === 'user' && styles.chatBubbleUserText]}>
                  {msg.content}
                </Text>
                {msg.showConnectChip && (
                  <TouchableOpacity
                    style={styles.chatConnectChip}
                    onPress={() => setOpenSettingsSection('provider')}
                  >
                    <Text style={styles.chatConnectChipText}>Connect your account</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {chatLoading && (
              <View style={styles.chatBubbleAssist}>
                <Text style={styles.chatBubbleText}>●●●</Text>
              </View>
            )}
          </ScrollView>

          {firstChatNudgeVisible && (
            <View style={styles.firstChatNudgeCard}>
              <Text style={styles.firstChatNudgeText}>
                Connect your own AI account for reliable, unlimited access.
              </Text>
              <View style={styles.firstChatNudgeActions}>
                <TouchableOpacity
                  onPress={() => { dismissFirstChatNudge(); setOpenSettingsSection('provider') }}
                  hitSlop={6}
                >
                  <Text style={styles.firstChatNudgeConnect}>Connect</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissFirstChatNudge} hitSlop={8}>
                  <Text style={styles.firstChatNudgeDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatInputVal}
              onChangeText={setChatInputVal}
              placeholder={placeholder}
              placeholderTextColor={C.inkMuted}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              multiline={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, chatInputVal.trim() ? styles.sendBtnActive : null]}
              onPress={sendMessage}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  )
}

// ─── Record Lightbox ──────────────────────────────────────────────────────────

// Lazily fetches the full-resolution stored image for the lightbox (Task
// 5.6), distinct from renderRecordThumb's thumbnail-only fetch (Task 5.5).
// Keyed by `imageId` at the call site below so switching records remounts
// this component (fresh `uri: null` state) instead of resetting state
// synchronously inside the effect body.
function LightboxFullImage({ imageId, fallback }: { imageId: string; fallback: ReactNode }) {
  const idb = useOptionalIndexedDb()
  const [uri, setUri] = useState<string | null>(null)

  useEffect(() => {
    if (!idb) return
    let cancelled = false
    let objectUrl: string | null = null
    getRecordImageBlob(idb, imageId)
      .then((result) => {
        if (cancelled || !result) return
        objectUrl = URL.createObjectURL(result.blob)
        setUri(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [idb, imageId])

  if (!uri) return <>{fallback}</>
  return <Image source={{ uri }} style={{ width: sc(358), height: sc(226), borderRadius: 6 }} contentFit="cover" />
}

function RecordLightbox() {
  const { lightboxRecord, setLightboxRecord, selectedRecords, setSelectedRecords } = useAppStore()
  if (!lightboxRecord) return null

  const rec = lightboxRecord
  const inChat = selectedRecords.some((r) => r.id === rec.id)

  return (
    <View style={styles.lightbox}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setLightboxRecord(null)} />
      <View style={styles.lightboxContent}>
        <View style={styles.lightboxTop}>
          <Text style={[styles.lightboxBadge, { color: rec.color }]}>{rec.type}</Text>
          <TouchableOpacity onPress={() => setLightboxRecord(null)} hitSlop={12}>
            <Text style={styles.lightboxClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.lightboxThumb}>
          {rec.imageId
            ? <LightboxFullImage key={rec.imageId} imageId={rec.imageId} fallback={renderRecordThumb(rec, sc(358), sc(226))} />
            : renderRecordThumb(rec, sc(358), sc(226))}
        </View>
        <Text style={styles.lightboxLabel}>{rec.label}</Text>
        <Text style={styles.lightboxDate}>{rec.date}</Text>
        <TouchableOpacity
          style={[styles.lightboxAddBtn, inChat && { backgroundColor: rec.color }]}
          onPress={() => {
            setSelectedRecords(
              inChat
                ? selectedRecords.filter((r) => r.id !== rec.id)
                : [...selectedRecords, rec],
            )
          }}
        >
          <Text style={styles.lightboxAddText}>{inChat ? '✓ In chat' : 'Add to chat'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
// The provider deep-link still uses `openSettingsSection:'provider'`.

// Real flag graphics for the language picker. Flag emoji (🇺🇸 etc.) fall back to
// plain "US"/"JP" letters on Windows, so we draw simplified SVG flags instead for
// a consistent visual experience across platforms.
function LangFlag({ code }: { code: SupportedLang }) {
  const sh = 40 / 13 // US stripe height
  return (
    <View style={styles.langFlagBox}>
      <Svg width={sc(26)} height={sc(18)} viewBox="0 0 60 40">
        {code === 'en' && (
          <>
            <Rect x={0} y={0} width={60} height={40} fill="#fff" />
            {[0, 2, 4, 6, 8, 10, 12].map((i) => (
              <Rect key={i} x={0} y={i * sh} width={60} height={sh} fill="#B22234" />
            ))}
            <Rect x={0} y={0} width={25} height={sh * 7} fill="#3C3B6E" />
            {[5, 12.5, 20].map((cy) =>
              [4, 11, 18].map((cx) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill="#fff" />),
            )}
          </>
        )}
        {code === 'zh-TW' && (
          <>
            <Rect x={0} y={0} width={60} height={40} fill="#FE0000" />
            <Rect x={0} y={0} width={30} height={20} fill="#000095" />
            <Circle cx={15} cy={10} r={6} fill="#fff" />
            <Circle cx={15} cy={10} r={4} fill="#000095" />
            <Circle cx={15} cy={10} r={2} fill="#fff" />
          </>
        )}
        {code === 'ja' && (
          <>
            <Rect x={0} y={0} width={60} height={40} fill="#fff" />
            <Circle cx={30} cy={20} r={11} fill="#BC002D" />
          </>
        )}
        {code === 'es' && (
          <>
            <Rect x={0} y={0} width={60} height={10} fill="#C60B1E" />
            <Rect x={0} y={10} width={60} height={20} fill="#FFC400" />
            <Rect x={0} y={30} width={60} height={10} fill="#C60B1E" />
          </>
        )}
      </Svg>
    </View>
  )
}

// Compact month picker: a single field that expands into a scrollable list,
// instead of 12 always-visible buttons.
function MonthDropdown({
  value, onChange, open, setOpenDropdown,
}: {
  value: string
  onChange: (m: string) => void
  open: boolean
  setOpenDropdown: (id: SettingsDropdownId) => void
}) {
  return (
    <View style={[styles.monthDdWrap, open && styles.monthDdWrapOpen]}>
      <SettingsDropdown
        open={open}
        onToggle={() => setOpenDropdown(open ? null : 'month')}
        onSelect={onChange}
        options={MONTHS_SHORT}
        optionKey={(mo) => mo}
        optionLabel={(mo) => mo}
        value={<Text style={styles.monthDdValue}>{value}</Text>}
        renderOption={(mo, active) => (
          <Text style={[styles.monthDdItemText, active && styles.monthDdItemTextActive]}>{mo}</Text>
        )}
        isActive={(mo) => mo === value}
      />
    </View>
  )
}

function LanguageDropdown({
  value, onChange, open, setOpenDropdown,
}: {
  value: SupportedLang
  onChange: (lang: SupportedLang) => void
  open: boolean
  setOpenDropdown: (id: SettingsDropdownId) => void
}) {
  const selected = SUPPORTED_LANGS.find((lang) => lang.code === value) ?? SUPPORTED_LANGS[0]

  return (
    <View style={[styles.langDdWrap, open && styles.langDdWrapOpen]}>
      <SettingsDropdown
        open={open}
        onToggle={() => setOpenDropdown(open ? null : 'language')}
        onSelect={(lang) => onChange(lang.code)}
        options={SUPPORTED_LANGS}
        optionKey={(lang) => lang.code}
        optionLabel={(lang) => lang.english}
        value={(
          <View style={styles.langValue}>
            <LangFlag code={selected.code} />
            <Text style={styles.langNative}>{selected.native}</Text>
            <Text style={styles.langEnglish}>{selected.english}</Text>
          </View>
        )}
        renderOption={(lang) => (
          <View style={styles.langOption}>
            <LangFlag code={lang.code} />
            <Text style={styles.langNative}>{lang.native}</Text>
            <Text style={styles.langEnglish}>{lang.english}</Text>
          </View>
        )}
        isActive={(lang) => lang.code === value}
      />
    </View>
  )
}

function SettingsSheet({ onExit }: { onExit?: () => void }) {
  const insets = useSafeAreaInsets()
  const { height: winH } = useWindowDimensions()
  const {
    settingsOpen, toggleSettings,
    preferredLanguage, setPreferredLanguage,
    birthYear, setBirthYear,
    birthMonth, setBirthMonth,
    gender, setGender,
    openSettingsSection, setOpenSettingsSection,
  } = useAppStore()

  const idb = useOptionalIndexedDb()
  const [importConfirm, setImportConfirm] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<SettingsDropdownId>(null)
  // Derived, not effect-cleared: closing settings should hide any open dropdown
  // without a render-then-clear round trip.
  const effectiveOpenDropdown: SettingsDropdownId = settingsOpen ? openDropdown : null
  const [providerSettingsDirty, setProviderSettingsDirty] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  function closeSettings() {
    setOpenDropdown(null)
    if (!providerSettingsDirty) {
      toggleSettings()
      onExit?.()
      return
    }
    setDiscardConfirmOpen(true)
  }

  // Backup file I/O is web-only for now (native has no post-restore refresh path,
  // so a native import would leave the Zustand store / UI stale until restart).
  const backupAvailable = !!idb && IS_WEB

  async function handleExport() {
    if (!backupAvailable || !idb) return
    try {
      setBackupError(null)
      const json = await exportIndexedDbBackupToJson(idb)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `maigenki-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  async function handleImport() {
    if (!backupAvailable || !idb) return
    try {
      setBackupError(null)
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      })
      if (result.canceled) {
        setImportConfirm(false)
        return
      }
      const asset = result.assets[0]
      if (!asset) {
        setImportConfirm(false)
        return
      }
      const json = await fetch(asset.uri).then((r) => r.text())
      await importIndexedDbBackupFromJson(idb, json)
      setImportConfirm(false)
      if (Platform.OS === 'web') window.location.reload()
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Import failed')
      setImportConfirm(false)
    }
  }

  // Local draft so the year field can be typed freely; only a valid 4-digit year
  // is committed to the store (and persisted). Re-syncs when birthYear changes
  // externally, e.g. when settings are hydrated from SQLite.
  // Resync the draft when birthYear changes externally (e.g. settings hydrated
  // from SQLite). React's "adjust state during render" pattern — preferred over an
  // effect, which would cause an extra render pass.
  const [yearDraft, setYearDraft] = useState(String(birthYear))
  const [prevBirthYear, setPrevBirthYear] = useState(birthYear)
  if (birthYear !== prevBirthYear) {
    setPrevBirthYear(birthYear)
    setYearDraft(String(birthYear))
  }

  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    Animated.timing(anim, {
      toValue: settingsOpen ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: !IS_WEB,
    }).start()
  }, [anim, settingsOpen])

  // React to an upgrade-nudge CTA (e.g. analyzing.tsx) asking us to open the
  // Open settings from an upgrade-nudge CTA; clear the flag so it does not
  // re-trigger on the next render.
  useEffect(() => {
    if (openSettingsSection !== 'provider') return
    if (!settingsOpen) toggleSettings()
    setOpenSettingsSection(null)
  }, [openSettingsSection, settingsOpen, toggleSettings, setOpenSettingsSection])

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [winH + insets.bottom + sc(40), 0] })

  return (
    <Animated.View
      pointerEvents={settingsOpen ? 'auto' : 'none'}
      style={[styles.settingsSheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}
    >
      <Pressable style={styles.settingsContent} onPress={() => setOpenDropdown(null)}>
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <TouchableOpacity onPress={closeSettings} hitSlop={12}>
          <Text style={styles.sheetCloseBtn}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.settingsScroll}
        contentContainerStyle={styles.settingsScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.settingsSectionLabel}>Language</Text>
      <LanguageDropdown
        value={preferredLanguage}
        onChange={setPreferredLanguage}
        open={effectiveOpenDropdown === 'language'}
        setOpenDropdown={setOpenDropdown}
      />

      <View style={[styles.birthGenderRow, effectiveOpenDropdown === 'month' && styles.birthGenderRowOpen]}>
        <View style={styles.birthCol}>
          <Text style={styles.settingsSectionLabel}>Birth: Inferred</Text>
          <View style={styles.dobRow}>
            <TextInput
              style={styles.dobYearInput}
              value={yearDraft}
              onChangeText={(v) => {
                const digits = v.replace(/[^0-9]/g, '').slice(0, 4)
                setYearDraft(digits)
                const n = parseInt(digits, 10)
                if (digits.length === 4 && n > 1900 && n < 2030) setBirthYear(n)
              }}
              keyboardType="numeric"
              maxLength={4}
              placeholder="YYYY"
              placeholderTextColor={C.inkMuted}
            />
            <MonthDropdown
              value={birthMonth}
              onChange={setBirthMonth}
              open={effectiveOpenDropdown === 'month'}
              setOpenDropdown={setOpenDropdown}
            />
          </View>
          <Text style={styles.settingsHint}>Privacy: date not stored.</Text>
        </View>

        <View style={styles.genderCol}>
          <Text style={styles.settingsSectionLabel}>Gender: Inferred</Text>
          <View style={styles.genderRow}>
            {(['female', 'male'] as Gender[]).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.genderOpt, gender === g && styles.genderOptActive]}
                onPress={() => setGender(g)}
                activeOpacity={0.8}
                accessibilityLabel={g === 'female' ? 'Female' : 'Male'}
              >
                <Text style={[styles.genderOptIcon, gender === g && styles.genderOptTextActive]}>
                  {g === 'female' ? '♀' : '♂'}
                </Text>
                <Text style={[styles.genderOptLetter, gender === g && styles.genderOptTextActive]}>
                  {g === 'female' ? 'F' : 'M'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.settingsHint}>Tap to correct.</Text>
        </View>
      </View>

      <Text style={styles.settingsSectionLabel}>Backup</Text>
      <View style={{ flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP) }}>
        <TouchableOpacity
          style={[styles.backupBtn, !backupAvailable && { opacity: 0.4 }]}
          onPress={handleExport}
          disabled={!backupAvailable}
        >
          <Text style={styles.backupBtnText}>Export</Text>
        </TouchableOpacity>
        {!importConfirm ? (
          <TouchableOpacity
            style={[styles.backupBtn, !backupAvailable && { opacity: 0.4 }]}
            onPress={() => {
              setBackupError(null)
              setImportConfirm(true)
            }}
            disabled={!backupAvailable}
          >
            <Text style={styles.backupBtnText}>Import</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.backupBtn, { borderColor: C.aqua }]}
              onPress={handleImport}
            >
              <Text style={[styles.backupBtnText, { color: C.aqua }]}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backupBtn} onPress={() => setImportConfirm(false)}>
              <Text style={styles.backupBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      {importConfirm && (
        <Text style={styles.backupWarn}>Import replaces all current data.</Text>
      )}
      {backupError && <Text style={styles.backupWarn}>{backupError}</Text>}
      {!idb ? (
        <Text style={styles.settingsHint}>Storage unavailable — backup disabled.</Text>
      ) : !IS_WEB ? (
        <Text style={styles.settingsHint}>Backup is web-only for now.</Text>
      ) : null}

      <View style={[styles.providerSectionBox, providerSettingsDirty && styles.providerSectionBoxOpen]}>
        <ProviderSettings
          openDropdown={effectiveOpenDropdown}
          setOpenDropdown={setOpenDropdown}
          onDirtyChange={setProviderSettingsDirty}
        />
      </View>
      </ScrollView>
      {discardConfirmOpen && (
        <View style={styles.unsavedOverlay}>
          <View style={styles.unsavedDialog}>
            <Text style={styles.unsavedTitle}>Unsaved changes</Text>
            <Text style={styles.unsavedMessage}>
              Your validated provider settings are not saved. Discard them and leave settings?
            </Text>
            <View style={styles.unsavedActions}>
              <TouchableOpacity
                style={styles.unsavedKeepBtn}
                onPress={() => setDiscardConfirmOpen(false)}
              >
                <Text style={styles.unsavedKeepText}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.unsavedDiscardBtn}
                onPress={() => {
                  setDiscardConfirmOpen(false)
                  setProviderSettingsDirty(false)
                  toggleSettings()
                  onExit?.()
                }}
              >
                <Text style={styles.unsavedDiscardText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </Pressable>
    </Animated.View>
  )
}

// ─── Upload Shortcuts ─────────────────────────────────────────────────────────

type PickedUploadAsset = {
  uri: string
  name?: string | null
  mimeType?: string | null
}

function pickedUploadKind(asset: PickedUploadAsset): PendingUpload['kind'] {
  const mimeType = asset.mimeType?.toLowerCase() ?? ''
  const name = asset.name?.toLowerCase() ?? asset.uri.toLowerCase()
  return mimeType.includes('pdf') || name.endsWith('.pdf') ? 'pdf' : 'image'
}

function UploadShortcuts({
  onResetView,
}: {
  onResetView: () => void
}) {
  const {
    startAnalyze, openHealthChat, setPendingUpload, setPipelineError,
  } = useAppStore()

  function beginUpload(upload: PendingUpload) {
    setPendingUpload(upload)
    startAnalyze()
    router.push('/analyzing')
  }

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      if (!asset?.uri) return
      beginUpload({ uri: asset.uri, kind: pickedUploadKind(asset) })
    } catch {
      setPipelineError('Could not open file picker.')
    }
  }

  async function handleCamera() {
    if (IS_WEB) {
      await handlePickFile()
      return
    }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 })
      if (result.canceled) return
      const uri = result.assets[0]?.uri
      if (!uri) return
      beginUpload({ uri, kind: 'image' })
    } catch {
      setPipelineError('Could not open camera.')
    }
  }

  return (
    <View style={styles.uploadWrap}>
      <TouchableOpacity style={styles.resetViewBtn} onPress={onResetView}>
        <Svg width={fs(14)} height={fs(14)} viewBox="0 0 24 24" fill="none">
          <SvgPath d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" stroke={C.inkMuted} strokeWidth={1.8} strokeLinecap="round" />
          <SvgPath d="M3 3v5h5" stroke={C.inkMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
      <Pressable style={styles.uploadBtns}>
        <TouchableOpacity style={styles.uploadShortcut} onPress={handlePickFile}>
          <Svg width={fs(16)} height={fs(16)} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke={C.purpleLight} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
            <SvgPath d="M14 2v6h6" stroke={C.purpleLight} strokeWidth={1.6} fill="none" />
            <SvgPath d="M12 18v-6M9 15l3-3 3 3" stroke={C.purpleLight} strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity style={styles.uploadShortcut} onPress={handleCamera}>
          <Svg width={fs(16)} height={fs(16)} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={7} width={18} height={13} rx={2} stroke={C.aqua} strokeWidth={1.6} fill="none" />
            <Circle cx={12} cy={13} r={3.2} stroke={C.aqua} strokeWidth={1.6} fill="none" />
            <SvgPath d="M8 7l1.5-2h5L16 7" stroke={C.aqua} strokeWidth={1.6} fill="none" />
          </Svg>
        </TouchableOpacity>
        <TouchableOpacity style={styles.uploadShortcutChat} onPress={openHealthChat}>
          <ChatBubbleIcon color={C.purpleLight} size={fs(14)} />
        </TouchableOpacity>
      </Pressable>
      <TouchableOpacity style={styles.qsWordmark} onPress={openQSWebsite}>
        <QSWordmark size={fs(28)} onDark={true} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function BodyMapScreen() {
  const { source, added, settings, returnTo } = useLocalSearchParams<{ source?: string; added?: string; settings?: string; returnTo?: string }>()
  const browserParams = IS_WEB && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null
  const sourceParam = source ?? browserParams?.get('source') ?? undefined
  const addedParam = added ?? browserParams?.get('added') ?? undefined
  const routeConditionSource = sourceParam === 'demo' || sourceParam === 'auto' ? sourceParam : undefined
  const routeAddedCount = addedParam && /^\d+$/.test(addedParam) ? parseInt(addedParam, 10) : null
  const returnToLanding = returnTo === 'landing'
  const {
    activeSystems, selectCondition,
    currentYear, sheetOpen, settingsOpen,
    condDateOverrides, selectedCondition,
    locationEditingCondition, locationEditMode, setLocationEditMessage,
    lastUploadResult, setLastUploadResult,
    setCurrentYear, setConditionSource,
    toggleSettings,
    birthYear, birthMonth,
    genderPromptNeeded, setGenderPromptNeeded, setGender,
  } = useAppStore()

  const [conditions, refreshConditions, updateConditionPositionLocally] = useConditions(routeConditionSource)
  const [dots, refreshDots] = useConditionDots(routeConditionSource)
  const idb = useOptionalIndexedDb()
  const settingsRequested = useRef(false)

  useEffect(() => {
    if (settings !== '1' || settingsRequested.current) return
    settingsRequested.current = true
    if (!useAppStore.getState().settingsOpen) toggleSettings()
  }, [settings, toggleSettings])

  const handleSettingsExit = useCallback(() => {
    if (returnToLanding) router.replace('/')
  }, [returnToLanding])
  const clearAddedParam = useCallback(() => {
    if (!IS_WEB || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('added')) return
    url.searchParams.delete('added')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [])

  useEffect(() => {
    if (routeConditionSource) setConditionSource(routeConditionSource)
  }, [routeConditionSource, setConditionSource])

  useEffect(() => {
    if (routeAddedCount === null) return
    setLastUploadResult({
      recordId: routeConditionSource ?? 'arrival',
      conditionCount: routeAddedCount,
      measurementCount: 0,
    })
    clearAddedParam()
  }, [routeAddedCount, routeConditionSource, setLastUploadResult, clearAddedParam])

  // ── Upload arrival (Phase 9.6) ──
  // Reload conditions from the DB when a new upload landed.
  useEffect(() => {
    if (lastUploadResult) refreshConditions()
  }, [lastUploadResult, refreshConditions])

  useEffect(() => {
    if (lastUploadResult) refreshDots()
  }, [lastUploadResult, refreshDots])

  useEffect(() => {
    if (conditions.length === 0) return
    const years = conditions
      .map((c) => conditionYear(c, condDateOverrides))
      .filter((year) => Number.isFinite(year))
    if (years.length === 0) return
    const newest = Math.max(...years)
    const oldest = Math.min(...years)
    const railMin = railLowerLimit(oldest, birthYear, birthMonth)
    const railMax = newest + RAIL_RANGE_PAD_AFTER
    if (lastUploadResult) {
      setCurrentYear(newest)
    } else if (currentYear < railMin) {
      setCurrentYear(railMin)
    } else if (currentYear > railMax) {
      setCurrentYear(railMax)
    }
  }, [lastUploadResult, conditions, condDateOverrides, currentYear, birthYear, birthMonth, setCurrentYear])

  // ── One-time gender prompt (Phase 9.7.3) ──
  function chooseGender(g: Gender) {
    // No explicit settings write here — useSettingsPersistence's own effect
    // already persists `gender` reactively whenever the store value changes.
    setGender(g)
    setGenderPromptNeeded(false)
  }

  const handleConditionPress = useCallback((c: DesignCondition) => {
    selectCondition(c)
  }, [selectCondition])

  // Add tool: places a new location for locationEditingCondition at the tapped
  // coordinates. A condition with zero real condition_locations rows (a
  // legacy/fallback condition rendering its synthesized dot) dual-writes the
  // condition's own cx/cy via updateIndexedConditionPosition, mirroring the
  // pre-existing relocation dual-write pattern, so getIndexedConditionDots
  // stops falling back once a real location exists.
  const handleLocationAdd = useCallback(async (cx: number, cy: number) => {
    if (!locationEditingCondition || !idb) return
    const cxPercent = (cx / 260) * 100
    const cyPercent = (cy / 460) * 100
    const existingLocations = await getConditionLocations(idb, locationEditingCondition.id)
    if (existingLocations.length === 0) {
      updateConditionPositionLocally(locationEditingCondition.id, cxPercent, cyPercent)
      await updateIndexedConditionPosition(idb, locationEditingCondition.id, cxPercent, cyPercent)
      refreshConditions()
    } else {
      await putIndexedConditionLocation(idb, {
        id: uuid(), condition_id: locationEditingCondition.id, cx: cxPercent, cy: cyPercent, is_primary: false,
      })
    }
    refreshDots()
  }, [locationEditingCondition, idb, refreshConditions, refreshDots, updateConditionPositionLocally])

  // Remove tool: deletes the tapped location, rejecting an attempt that would
  // leave the condition with zero locations (§5.10) — this covers both the
  // synthesized fallback dot (locationId === null) and the last real row.
  const handleLocationRemoveAttempt = useCallback(async (dot: IndexedConditionDot) => {
    if (!locationEditingCondition || !idb) return
    if (dot.locationId === null) {
      setLocationEditMessage("Can't remove the last location")
      return
    }
    const existingLocations = await getConditionLocations(idb, locationEditingCondition.id)
    if (existingLocations.length <= 1) {
      setLocationEditMessage("Can't remove the last location")
      return
    }
    await deleteConditionLocation(idb, dot.locationId)
    refreshDots()
  }, [locationEditingCondition, idb, refreshDots, setLocationEditMessage])

  const dismissUploadMessage = useCallback(() => {
    if (useAppStore.getState().lastUploadResult) setLastUploadResult(null)
    clearAddedParam()
    return false
  }, [setLastUploadResult, clearAddedParam])

  // ── Body-map zoom & pan ──
  // Mobile: two-finger pinch zooms, one-finger drag pans.
  // Web: mouse wheel zooms, right-click drag pans.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view })
  const bodyWrapRef = useRef<View>(null)
  // mode: 0 = idle, 1 = one-finger pan, 2 = pinch. cx/cy = measured canvas centre.
  const gesture = useRef({ mode: 0, dist: 0, x: 0, y: 0, scale: 1, tx: 0, ty: 0, cx: 0, cy: 0 })

  const clampScale = (s: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s))
  const resetView = useCallback(() => setView({ scale: 1, tx: 0, ty: 0 }), [])

  useEffect(() => {
    if (!IS_WEB) return
    const node = bodyWrapRef.current as unknown as HTMLElement | null
    if (!node) return
    let panning = false
    let lastX = 0
    let lastY = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { scale, tx, ty } = viewRef.current
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * Math.exp(-e.deltaY * 0.0015)))
      const k = next / scale
      const rect = node.getBoundingClientRect()
      const qx = e.clientX - (rect.left + rect.width / 2)
      const qy = e.clientY - (rect.top + rect.height / 2)
      // Zoom about the cursor: keep the content point under it fixed.
      setView({ scale: next, tx: k * tx + qx * (1 - k), ty: k * ty + qy * (1 - k) })
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      panning = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return
      const { scale, tx, ty } = viewRef.current
      setView({ scale, tx: tx + e.clientX - lastX, ty: ty + e.clientY - lastY })
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMouseUp = () => { panning = false }
    // Touch handlers for mobile web: 2-finger pinch = scale, 2-finger drag = pan.
    // Must use non-passive listeners so preventDefault() blocks the browser's
    // own pinch-to-zoom (which would scale the whole viewport, not just the layers).
    let twoFingerActive = false
    let tfStartDist = 0, tfM0x = 0, tfM0y = 0
    let tfStartScale = 1, tfStartTx = 0, tfStartTy = 0
    let tfCx = 0, tfCy = 0 // canvas centre (transform origin) at gesture start
    const touchInfo = (t: TouchList) => ({
      dist: Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY),
      mx: (t[0].clientX + t[1].clientX) / 2,
      my: (t[0].clientY + t[1].clientY) / 2,
    })
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        twoFingerActive = true
        const rect = node.getBoundingClientRect()
        tfCx = rect.left + rect.width / 2
        tfCy = rect.top + rect.height / 2
        const { dist, mx, my } = touchInfo(e.touches)
        tfStartDist = dist
        tfM0x = mx - tfCx; tfM0y = my - tfCy // start midpoint relative to centre
        tfStartScale = viewRef.current.scale
        tfStartTx = viewRef.current.tx
        tfStartTy = viewRef.current.ty
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!twoFingerActive || e.touches.length !== 2) return
      e.preventDefault()
      const { dist, mx, my } = touchInfo(e.touches)
      const scale = clampScale(tfStartScale * (dist / tfStartDist))
      const k = scale / tfStartScale
      // Zoom about the pinch midpoint: keep the content point under it pinned to
      // the (moving) midpoint as the fingers spread, pinch, and drag.
      setView({
        scale,
        tx: (mx - tfCx) - k * (tfM0x - tfStartTx),
        ty: (my - tfCy) - k * (tfM0y - tfStartTy),
      })
    }
    const onTouchEnd = () => { twoFingerActive = false }
    // iOS Safari ignores user-scalable=no and fires proprietary gesture* events for
    // pinch-zoom. Swallowing them at the document level is the only reliable way to
    // stop Safari from zooming the whole page instead of just the body-map layers.
    const onGesture = (e: Event) => e.preventDefault()

    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('contextmenu', onContextMenu)
    node.addEventListener('mousedown', onMouseDown)
    node.addEventListener('touchstart', onTouchStart, { passive: false })
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    node.addEventListener('touchend', onTouchEnd)
    node.addEventListener('touchcancel', onTouchEnd)
    document.addEventListener('gesturestart', onGesture, { passive: false })
    document.addEventListener('gesturechange', onGesture, { passive: false })
    document.addEventListener('gestureend', onGesture, { passive: false })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('contextmenu', onContextMenu)
      node.removeEventListener('mousedown', onMouseDown)
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('gesturestart', onGesture)
      document.removeEventListener('gesturechange', onGesture)
      document.removeEventListener('gestureend', onGesture)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Claims the responder only on movement, so taps still reach condition dots.
  const panResponderProps = IS_WEB ? {} : {
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: () => { gesture.current.mode = 0 },
    onResponderMove: (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches
      const g = gesture.current
      const v = viewRef.current
      if (touches.length >= 2) {
        const t0 = touches[0], t1 = touches[1]
        const dist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY)
        const mx = (t0.pageX + t1.pageX) / 2
        const my = (t0.pageY + t1.pageY) / 2
        if (g.mode !== 2) {
          // Capture initial mid-point and state for both pinch and pan. cx/cy is
          // measured async (NaN until it lands) so we can zoom about the midpoint.
          gesture.current = { mode: 2, dist, x: mx, y: my, scale: v.scale, tx: v.tx, ty: v.ty, cx: NaN, cy: NaN }
          bodyWrapRef.current?.measureInWindow((wx, wy, w, h) => {
            gesture.current.cx = wx + w / 2
            gesture.current.cy = wy + h / 2
          })
          return
        }
        const scale = clampScale(g.scale * (dist / g.dist))
        if (Number.isNaN(g.cx)) {
          // Centre not measured yet: centre-anchored zoom + midpoint pan.
          setView({ scale, tx: g.tx + (mx - g.x), ty: g.ty + (my - g.y) })
        } else {
          // Zoom about the pinch midpoint (relative to the measured canvas centre).
          const k = scale / g.scale
          setView({
            scale,
            tx: (mx - g.cx) - k * ((g.x - g.cx) - g.tx),
            ty: (my - g.cy) - k * ((g.y - g.cy) - g.ty),
          })
        }
      } else if (touches.length === 1) {
        const t = touches[0]
        if (g.mode !== 1) {
          gesture.current = { mode: 1, dist: 0, x: t.pageX, y: t.pageY, scale: v.scale, tx: v.tx, ty: v.ty, cx: 0, cy: 0 }
          return
        }
        setView({ scale: v.scale, tx: g.tx + t.pageX - g.x, ty: g.ty + t.pageY - g.y })
      }
    },
    onResponderRelease: () => { gesture.current.mode = 0 },
    onResponderTerminate: () => { gesture.current.mode = 0 },
  }

  return (
    <View
      style={styles.root}
      onStartShouldSetResponderCapture={dismissUploadMessage}
      onMoveShouldSetResponderCapture={dismissUploadMessage}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <NavBar />

        {/* One-time gender prompt when body type couldn't be inferred */}
        {genderPromptNeeded && (
          <View style={styles.arrivalCard}>
            <Text style={styles.arrivalTitle}>Which body map should we show?</Text>
            <View style={styles.arrivalBtnRow}>
              {(['female', 'male'] as Gender[]).map((g) => (
                <TouchableOpacity key={g} style={styles.arrivalBtn} onPress={() => chooseGender(g)}>
                  <Text style={styles.arrivalBtnText}>{g === 'female' ? '♀  Female' : '♂  Male'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.canvas}>
          <View ref={bodyWrapRef} style={styles.bodyWrap} {...panResponderProps}>
            <View
              style={[
                styles.bodyAspect,
                { transform: [{ translateX: view.tx }, { translateY: view.ty }, { scale: view.scale }] },
              ]}
            >
              <BodyLayers activeSystems={activeSystems} />
              <BodySvg
                activeSystems={activeSystems}
                dots={dots}
                onConditionPress={handleConditionPress}
                currentYear={currentYear}
                condDateOverrides={condDateOverrides}
                selectedCondition={selectedCondition}
                locationEditingCondition={locationEditingCondition}
              />
              <GhostDots
                dots={dots}
                conditions={conditions}
                activeSystems={activeSystems}
                onPress={handleConditionPress}
                locationEditMode={locationEditMode}
                locationEditingConditionId={locationEditingCondition?.id ?? null}
                onLocationAdd={locationEditMode === 'add' ? handleLocationAdd : undefined}
                onLocationRemoveAttempt={locationEditMode === 'remove' ? handleLocationRemoveAttempt : undefined}
              />
              <ConditionRipples
                dots={dots}
                activeSystems={activeSystems}
                currentYear={currentYear}
                condDateOverrides={condDateOverrides}
              />
            </View>
          </View>

          <LegendPanel />
          <VerticalTimeRail conditions={conditions} />
          <UploadShortcuts onResetView={resetView} />
        </View>
      </SafeAreaView>

      <ConditionSheet />
      <SettingsSheet onExit={returnToLanding ? handleSettingsExit : undefined} />
      <RecordLightbox />

      {(sheetOpen || settingsOpen) && (
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (sheetOpen) useAppStore.getState().closeSheet()
            if (settingsOpen) useAppStore.getState().toggleSettings()
          }}
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },

  nav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sc(20), paddingVertical: sc(6),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 0 },
  logoM: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(18), color: 'rgba(255,255,255,0.9)' },
  logoAI: { fontFamily: 'MOMCAKE-Bold', fontSize: fs(20), color: '#8A60EB', lineHeight: fs(20) },
  logoGenki: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(18), color: 'rgba(255,255,255,0.9)' },
  navChevronBox: { marginLeft: sc(8), width: fs(14), height: fs(14), alignItems: 'center', justifyContent: 'center', alignSelf: 'center', transform: [{ rotate: '0deg' }] },
  navChevronBoxOpen: { transform: [{ rotate: '180deg' }] },
  navCenterMessage: {
    position: 'absolute',
    left: sc(132),
    right: sc(132),
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  navCenterMessageText: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: fs(13),
    color: C.aqua,
    letterSpacing: sc(0.4),
    textTransform: 'uppercase',
  },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  navRelocationText: {
    flex: 1, textAlign: 'center',
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), letterSpacing: sc(0.2),
    paddingHorizontal: sc(6),
  },
  navLocationEdit: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: sc(8),
  },
  navLocationEditControls: { flexDirection: 'row', alignItems: 'center', gap: sc(6) },
  navLocationEditBtn: {
    paddingHorizontal: sc(8), paddingVertical: sc(4), borderRadius: sc(12),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  navLocationEditBtnText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(11), color: C.ink, letterSpacing: sc(0.2),
  },
  datePill: {
    paddingHorizontal: sc(10), paddingVertical: sc(4), borderRadius: sc(14),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  datePillText: { fontFamily: 'SourceCodePro', fontSize: fs(11), color: C.ink },

  // True-black canvas; userSelect keeps rail drags from selecting the layers on web
  canvas: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000', userSelect: 'none' },

  bodyWrap: {
    position: 'absolute', top: 0, left: IS_DESKTOP ? 0 : sc(90), right: RAIL_W_INACTIVE, bottom: 0,
    // Browser must not claim touch gestures here — our JS handles all pinch/pan.
    ...(IS_WEB ? { touchAction: 'none' as const } : {}),
  },
  bodyAspect: { height: '100%', aspectRatio: 260 / 460, alignSelf: 'center', position: 'relative' },
  bodySvg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  relocationBanner: {
    position: 'absolute', top: sc(12), left: sc(8), right: sc(8),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(10,12,20,0.85)', borderRadius: sc(10),
    paddingHorizontal: sc(14), paddingVertical: sc(8),
  },
  relocationText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13),
    flex: 1, letterSpacing: sc(0.3),
  },
  relocationCancel: {
    fontSize: fs(16), color: 'rgba(255,255,255,0.55)', paddingLeft: sc(12),
  },

  legendPanel: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: STATIC_DARK_BG, overflow: 'hidden', zIndex: 5,
  },
  legendInner: { paddingVertical: sc(10), paddingHorizontal: sc(12) },
  legendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: sc(8), paddingVertical: sc(5) },
  legendDot: { width: sc(8), height: sc(8), borderRadius: sc(4), alignSelf: 'center' },
  legendLabel: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(12), color: C.ink },
  legendOnlyBtn: { marginLeft: 'auto', paddingHorizontal: sc(3) - 1, paddingTop: 0, paddingBottom: 3, borderRadius: sc(3), borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  legendOnlyText: { fontWeight: '300' as const, letterSpacing: 0.2 },

  railWrap: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    backgroundColor: STATIC_DARK_BG, overflow: 'visible', zIndex: 3,
    // Browser must not vertically scroll when the finger drags the rail.
    ...(IS_WEB ? { touchAction: 'none' as const } : {}),
  },
  railTrack: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: STATIC_STROKE_BG },
  railDash: { position: 'absolute', left: sc(3), right: sc(3), height: 2, borderRadius: 1 },
  railThumb: {
    position: 'absolute', left: '50%', marginLeft: sc(-4), width: sc(8), height: sc(8), borderRadius: sc(4),
    backgroundColor: C.aqua,
    ...(IS_WEB
      ? { boxShadow: `0 0 ${sc(4)}px ${C.aqua}` }
      : { shadowColor: C.aqua, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4 }),
  },
  railLabel: { position: 'absolute', right: RAIL_W_ACTIVE + sc(4), backgroundColor: STATIC_DARK_BG, paddingHorizontal: sc(5), paddingVertical: sc(2), borderRadius: sc(4) },
  railLabelText: { fontFamily: 'SourceCodePro', fontSize: fs(9), color: C.aqua },
  railBookend: { position: 'absolute', right: sc(2), fontFamily: 'SourceCodePro', fontSize: fs(8), color: 'rgba(255,255,255,0.3)' },

  // Condition sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, paddingHorizontal: sc(20), paddingTop: sc(12),
    ...(IS_WEB
      ? { boxShadow: `0px ${sc(-4)}px ${sc(16)}px rgba(0,0,0,0.5)` }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 20 }),
    zIndex: 10,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: sc(10), marginBottom: sc(8) },
  sysDot: { width: sc(8), height: sc(8), borderRadius: sc(4) },
  sheetCondName: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(14), color: C.ink, flex: 1 },
  sheetCondSub: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted },
  sheetSysLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(11), letterSpacing: sc(2), textTransform: 'uppercase', color: C.inkMuted },
  sheetCloseBtn: { fontSize: fs(18), color: C.inkMuted, padding: sc(4) },

  sheetCondNameLarge: { fontFamily: 'MOMCAKE-Bold', fontSize: fs(26), color: C.ink, marginBottom: sc(4) },
  sheetCondSubEn: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(13), color: C.inkMuted, marginBottom: sc(10) },
  inferredBadge: {
    borderWidth: 1, borderColor: C.inkMuted, borderRadius: sc(4), paddingHorizontal: sc(6), paddingVertical: sc(2), marginBottom: sc(4),
  },
  inferredBadgeText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), textTransform: 'uppercase', letterSpacing: sc(1), color: C.inkMuted,
  },

  sheetDateRow: { marginBottom: sc(12) },
  dateViewRow: { flexDirection: 'row', alignItems: 'center', gap: sc(8) },
  sheetDateChip: { alignSelf: 'flex-start', paddingHorizontal: sc(10), paddingVertical: sc(4), borderRadius: sc(8), backgroundColor: 'rgba(31,195,164,0.12)' },
  sheetDateText: { fontFamily: 'SourceCodePro', fontSize: fs(12), color: C.aqua },
  datePencilBtn: { padding: sc(4) },
  datePencil: { fontSize: fs(14), color: C.inkMuted },
  dateEditRow: { flexDirection: 'row', alignItems: 'center', gap: sc(8) },
  dateEditInput: {
    width: sc(160), height: sc(34), borderRadius: sc(8), borderWidth: 1, borderColor: 'rgba(31,195,164,0.4)',
    paddingHorizontal: sc(10), fontFamily: 'SourceCodePro', fontSize: fs(13), color: C.aqua, backgroundColor: C.surfaceHigh,
  },
  dateEditBtn: { width: sc(30), height: sc(30), borderRadius: sc(8), alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHigh },
  dateEditConfirm: { color: C.aqua, fontSize: fs(16), fontWeight: '700' },
  dateEditCancel: { color: C.inkMuted, fontSize: fs(14) },

  sheetNote: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(16), color: C.ink, lineHeight: fs(22), marginBottom: sc(14) },

  // Source block (3 lines)
  sourceBlock: { marginBottom: sc(8) },
  sourceLine1: { marginBottom: sc(3) },
  sourceLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: sc(1.8) },
  sourceMeta: { fontFamily: 'SourceCodePro', fontSize: fs(10), color: 'rgba(255,255,255,0.32)' },
  sourceLine2: { fontFamily: 'SourceCodePro', fontSize: fs(10), color: 'rgba(255,255,255,0.32)', marginBottom: sc(4) },
  sourceLine3: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },
  sourceDoctor: { fontFamily: 'SourceCodePro', fontSize: fs(13), fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  sourceIcons: { flexDirection: 'row', alignItems: 'center', gap: sc(10) },

  sheetFooterRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: sc(16) },
  chatFooterBtn: { width: sc(36), height: sc(36), borderRadius: sc(8), backgroundColor: '#8A60EB', alignItems: 'center', justifyContent: 'center' },

  // Records carousel
  carousel: { maxHeight: sc(84), marginBottom: sc(6) },
  carouselContent: { paddingHorizontal: sc(10), gap: sc(9), alignItems: 'center' },
  recordCard: { width: sc(117), height: sc(74), borderRadius: sc(6), borderWidth: 1.5, overflow: 'hidden' },
  recordCardFooter: { paddingHorizontal: sc(6), paddingTop: sc(2) },
  recordCardLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), color: C.ink },
  recordCardDate: { fontFamily: 'SourceCodePro', fontSize: fs(8), color: C.inkMuted },
  recordSelCircle: { position: 'absolute', top: sc(4), right: sc(4), width: sc(18), height: sc(18), borderRadius: sc(9), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Chat
  chatScroll: { flex: 1 },
  chatContent: { padding: sc(12), gap: sc(10) },
  chatBubble: { maxWidth: '80%', paddingHorizontal: sc(14), paddingVertical: sc(10), borderRadius: sc(12) },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: C.purpleTint, borderRadius: sc(12), borderBottomRightRadius: sc(2) },
  chatBubbleAssist: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: sc(12), borderBottomLeftRadius: sc(2) },
  chatBubbleText: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(15), color: C.ink, lineHeight: fs(20) },
  chatBubbleUserText: { color: '#fff' },
  firstChatNudgeCard: {
    flexDirection: 'row', alignItems: 'center', gap: sc(10),
    marginHorizontal: sc(12), marginBottom: sc(8),
    paddingVertical: sc(10), paddingHorizontal: sc(12),
    borderRadius: sc(10), borderWidth: 1, borderColor: C.aqua,
    backgroundColor: 'rgba(31,195,164,0.08)',
  },
  firstChatNudgeText: {
    flex: 1, fontFamily: 'BarlowCondensed-Regular', fontSize: fs(13), color: C.ink, lineHeight: fs(17),
  },
  firstChatNudgeActions: { flexDirection: 'row', alignItems: 'center', gap: sc(12) },
  firstChatNudgeConnect: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.aqua,
  },
  firstChatNudgeDismiss: { fontSize: fs(14), color: C.inkMuted },
  chatConnectChip: {
    marginTop: sc(8), alignSelf: 'flex-start',
    borderWidth: 1, borderColor: C.aqua, borderRadius: sc(8),
    paddingVertical: sc(6), paddingHorizontal: sc(12),
  },
  chatConnectChipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(13), color: C.aqua, letterSpacing: 0.3 },
  chatInputRow: { flexDirection: 'row', gap: sc(8), paddingHorizontal: sc(12), paddingVertical: sc(10), borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatInput: {
    flex: 1, height: sc(40), borderRadius: sc(10), borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: sc(12), fontFamily: 'BarlowCondensed-Regular', fontSize: fs(15), color: C.ink, backgroundColor: C.surfaceHigh,
  },
  sendBtn: { width: sc(40), height: sc(40), borderRadius: sc(10), backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: C.purpleLight },
  sendBtnText: { color: C.ink, fontSize: fs(18), fontWeight: '700' },

  // Lightbox
  lightbox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(10,12,20,0.96)', alignItems: 'center', justifyContent: 'center' },
  lightboxContent: { width: sc(390), maxWidth: '92%', backgroundColor: C.surface, borderRadius: sc(16), padding: sc(16) },
  lightboxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: sc(12) },
  lightboxBadge: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), textTransform: 'uppercase', letterSpacing: sc(1) },
  lightboxClose: { fontSize: fs(18), color: C.inkMuted },
  lightboxThumb: { borderRadius: sc(8), overflow: 'hidden', alignSelf: 'center', marginBottom: sc(12) },
  lightboxLabel: { fontFamily: 'MOMCAKE-Bold', fontSize: fs(20), color: C.ink },
  lightboxDate: { fontFamily: 'SourceCodePro', fontSize: fs(11), color: C.inkMuted, marginBottom: sc(14) },
  lightboxAddBtn: { borderRadius: sc(10), paddingVertical: sc(12), alignItems: 'center', backgroundColor: C.purpleLight },
  lightboxAddText: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(15), color: '#fff', letterSpacing: sc(0.3) },

  // Settings
  settingsSheet: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.surface,
    paddingHorizontal: sc(20), zIndex: 15,
    ...(IS_WEB
      ? { boxShadow: `0px ${sc(-4)}px ${sc(16)}px rgba(0,0,0,0.5)` }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 20 }),
  },
  settingsContent: { width: '100%', flex: 1 },
  settingsScroll: { flex: 1 },
  settingsScrollContent: { paddingTop: sc(1), paddingHorizontal: sc(1), paddingBottom: sc(24) },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: sc(12) },
  unsavedOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,15,24,0.7)', alignItems: 'center', justifyContent: 'center', padding: sc(20), zIndex: 20000 },
  unsavedDialog: { width: '100%', maxWidth: sc(360), backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, borderRadius: sc(8), padding: sc(16) },
  unsavedTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(17), color: C.ink, textTransform: 'uppercase' },
  unsavedMessage: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(12), color: C.inkMuted, marginTop: sc(8), lineHeight: fs(16) },
  unsavedActions: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), marginTop: sc(16) },
  unsavedKeepBtn: { flex: 1, height: sc(38), borderWidth: 1, borderColor: C.border, borderRadius: sc(8), alignItems: 'center', justifyContent: 'center' },
  unsavedKeepText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.ink, textTransform: 'uppercase' },
  unsavedDiscardBtn: { flex: 1, height: sc(38), borderRadius: sc(8), backgroundColor: '#E05252', alignItems: 'center', justifyContent: 'center' },
  unsavedDiscardText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(12), color: C.ink, textTransform: 'uppercase' },
  settingsTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(18), color: C.ink, textTransform: 'uppercase', letterSpacing: sc(0.5) },
  settingsSectionLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(10), color: C.aqua, textTransform: 'uppercase', letterSpacing: sc(1), marginBottom: sc(10) },

  langDdWrap: { position: 'relative', zIndex: 20, marginBottom: sc(18) },
  langDdWrapOpen: { zIndex: 10000, elevation: 10000 },
  langDdField: {
    flexDirection: 'row', alignItems: 'center', gap: sc(10), height: sc(44),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: sc(8),
    paddingHorizontal: sc(10), backgroundColor: C.surfaceHigh,
  },
  langDdChevron: { fontSize: fs(9), color: C.aqua },
  langDdList: {
    position: 'absolute', top: sc(50), left: 0, right: 0,
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: sc(8), overflow: 'hidden', zIndex: 130,
    ...(IS_WEB ? { boxShadow: `0 ${sc(6)}px ${sc(16)}px rgba(0,0,0,0.5)` } : { elevation: 10 }),
  },
  langRowItem: {
    flexDirection: 'row', alignItems: 'center', gap: sc(10), paddingVertical: sc(10), paddingHorizontal: sc(10),
    borderLeftWidth: sc(3), borderLeftColor: 'transparent', borderRadius: sc(6),
  },
  langRowItemActive: { borderLeftColor: C.aqua, backgroundColor: 'rgba(31,195,164,0.12)' },
  langFlagBox: {
    width: sc(26), height: sc(18), borderRadius: sc(3), overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  langNative: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(14), fontWeight: '500', color: C.ink },
  langEnglish: { fontFamily: 'SourceCodePro', fontSize: fs(9.5), color: 'rgba(250,250,247,0.5)', flex: 1 },
  langCheck: { fontSize: fs(14), color: C.aqua },
  langValue: { flexDirection: 'row', alignItems: 'center', gap: sc(10), flex: 1 },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: sc(10), flex: 1 },

  birthGenderRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), alignItems: 'flex-start', zIndex: 60 },
  birthGenderRowOpen: { zIndex: 10001, elevation: 10001 },
  birthCol: { flex: 1, minWidth: 0, zIndex: 70 },
  genderCol: { flex: 1, minWidth: 0 },
  dobRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), marginBottom: sc(6), alignItems: 'flex-start', zIndex: 70 },
  dobYearInput: {
    height: sc(40), borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: sc(8), paddingHorizontal: sc(10),
    fontFamily: 'SourceCodePro', fontSize: fs(14), color: C.ink, backgroundColor: C.surfaceHigh,
    flexGrow: 0, flexShrink: 1, flexBasis: sc(60), minWidth: 0, textAlign: 'center',
  },

  // Month dropdown
  monthDdWrap: { position: 'relative', zIndex: 90, elevation: 90, flexGrow: 0, flexShrink: 1, flexBasis: sc(60), minWidth: 0 },
  monthDdWrapOpen: { zIndex: 10001, elevation: 10001 },
  monthDdField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: sc(40), width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: sc(8), paddingHorizontal: sc(10), backgroundColor: C.surfaceHigh, gap: sc(4),
  },
  monthDdValue: { fontFamily: 'SourceCodePro', fontSize: fs(14), color: C.ink },
  monthDdChevron: { fontSize: fs(9), color: C.inkMuted },
  monthDdList: {
    position: 'absolute', top: sc(44), left: 0, right: 0,
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: sc(8), overflow: 'hidden', zIndex: 100,
    ...(IS_WEB ? { boxShadow: `0 ${sc(6)}px ${sc(16)}px rgba(0,0,0,0.5)` } : { elevation: 8 }),
  },
  monthDdItem: { paddingVertical: sc(8), paddingHorizontal: sc(12) },
  monthDdItemActive: { backgroundColor: 'rgba(138,96,235,0.18)' },
  monthDdItemText: { fontFamily: 'SourceCodePro', fontSize: fs(13), color: C.ink },
  monthDdItemTextActive: { color: C.purpleLight },

  // Gender
  genderRow: { flexDirection: 'row', gap: sc(SETTINGS_CONTROL_GAP), marginBottom: sc(6) },
  genderOpt: {
    width: sc(60), height: sc(40), borderRadius: sc(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sc(4),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: C.surfaceHigh,
  },
  genderOptActive: { backgroundColor: C.purpleLight, borderColor: C.purpleLight },
  genderOptIcon: { fontSize: fs(20), lineHeight: fs(24), color: C.inkMuted },
  genderOptLetter: { fontFamily: 'BarlowCondensed-Bold', fontSize: fs(14), color: C.inkMuted },
  genderOptTextActive: { color: '#fff' },
  settingsHint: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: C.inkMuted, marginBottom: sc(12) },

  providerSectionBox: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: sc(14), marginTop: sc(18), marginBottom: sc(18),
  },
  providerSectionBoxOpen: { zIndex: 10000, elevation: 10000 },

  // Upload-arrival + gender prompt cards
  arrivalCard: {
    marginHorizontal: sc(12), marginTop: sc(8), padding: sc(12), borderRadius: sc(10),
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, gap: sc(8),
  },
  arrivalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sc(8) },
  arrivalTitle: { flex: 1, fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(14), color: C.ink, lineHeight: fs(18) },
  arrivalClose: { fontSize: fs(15), color: C.inkMuted, paddingLeft: sc(4) },
  arrivalBtnRow: { flexDirection: 'row', gap: sc(8) },
  arrivalBtn: {
    flex: 1, alignItems: 'center', paddingVertical: sc(9), borderRadius: sc(8),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  arrivalBtnText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink },

  // Backup
  backupBtn: {
    flex: 1, paddingVertical: sc(10), borderRadius: sc(8), borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', backgroundColor: C.surfaceHigh, alignItems: 'center',
  },
  backupBtnText: {
    fontFamily: 'BarlowCondensed-SemiBold', fontSize: fs(13), color: C.ink,
    textTransform: 'uppercase', letterSpacing: sc(0.5),
  },
  backupWarn: { fontFamily: 'BarlowCondensed-Regular', fontSize: fs(11), color: '#E5A24B', marginTop: sc(8) },

  // Upload shortcuts
  uploadWrap: { position: 'absolute', bottom: sc(20), left: sc(16), alignItems: 'flex-start', zIndex: 4 },
  resetViewBtn: { width: sc(24), height: sc(24), borderRadius: sc(5), borderWidth: 1, borderColor: STATIC_STROKE_BG, backgroundColor: STATIC_DARK_BG, alignItems: 'center', justifyContent: 'center', marginBottom: sc(5) },
  uploadBtns: { gap: sc(5), alignItems: 'flex-start', marginBottom: sc(6) },
  uploadShortcut: { width: sc(24), height: sc(24), borderRadius: sc(5), borderWidth: 1, borderColor: STATIC_STROKE_BG, backgroundColor: STATIC_DARK_BG, alignItems: 'center', justifyContent: 'center' },
  uploadShortcutChat: { width: sc(24), height: sc(24), borderRadius: sc(5), borderWidth: 1, borderColor: STATIC_STROKE_BG, backgroundColor: STATIC_DARK_BG, alignItems: 'center', justifyContent: 'center' },
  qsWordmark: { opacity: STATIC_UI_ALPHA },

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9 },
})
