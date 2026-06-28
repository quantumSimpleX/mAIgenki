import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated, Dimensions, Easing, GestureResponderEvent,
  KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, {
  Circle, Ellipse, G, Line, Path as SvgPath, Rect,
} from 'react-native-svg'
import { QSWordmark } from '@/components/QSWordmark'
import { useAppStore } from '@/store/useAppStore'
import { useConditions, useConditionRecords } from '@/hooks/useConditions'
import {
  ALL_SYSTEMS, ConditionRecord, DesignCondition, SystemId,
  SYSTEM_META, SupportedLang, getLocalName,
} from '@/model/conditions'
import { parseEvidence, formatDateDisplay } from '@/lib/support'

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
const MIN_YEAR = 2013
const MAX_YEAR = 2024

function toLinear(yearFrac: number): number {
  return Math.max(0, Math.min(1, (yearFrac - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)))
}
function toLogFrac(yearFrac: number): number {
  const t = toLinear(yearFrac)
  return (Math.exp(K * t) - 1) / (Math.exp(K) - 1)
}
function toVertPos(yearFrac: number, railH: number): number {
  return (1 - toLogFrac(yearFrac)) * railH
}
function fromVertPos(posY: number, railH: number): number {
  if (railH <= 0) return MAX_YEAR
  const frac = 1 - posY / railH
  const clamped = Math.max(0, Math.min(1, frac))
  const t = Math.log(clamped * (Math.exp(K) - 1) + 1) / K
  return MIN_YEAR + t * (MAX_YEAR - MIN_YEAR)
}

const DISCLAIMER = 'Educational only. Not medical advice. Never a substitute for professional clinical judgment.'

// ─── Small SVG icons ──────────────────────────────────────────────────────────

function MailIcon({ color = C.aqua, size = 15 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={2} stroke={color} strokeWidth={1.8} />
      <SvgPath d="M4 7l8 6 8-6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

function PhoneIcon({ color = C.aqua, size = 15 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M6.6 3h3l1.5 4.5-2 1.3a12 12 0 005.8 5.8l1.3-2 4.5 1.5v3a2 2 0 01-2.2 2A17 17 0 014.6 5.2 2 2 0 016.6 3z"
        stroke={color} strokeWidth={1.6} fill="none"
      />
    </Svg>
  )
}

function ChatBubbleIcon({ color = '#fff', size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M4 5h16v11H9l-4 4v-4H4z"
        stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round"
      />
    </Svg>
  )
}

// ─── Record thumbnails (SVG, one per type) ───────────────────────────────────

function renderRecordThumb(rec: ConditionRecord, w: number, h: number) {
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
  } = useAppStore()

  return (
    <View style={styles.nav}>
      <TouchableOpacity onPress={toggleLegend} hitSlop={12} style={styles.logoRow}>
        <Text style={styles.logoM}>m</Text>
        <Text style={styles.logoAI}>AI</Text>
        <Text style={styles.logoGenki}> Genki</Text>
        <Text style={[styles.navChevron, legendOpen && styles.navChevronOpen]}>›</Text>
      </TouchableOpacity>
      <View style={styles.navRight}>
        <TouchableOpacity style={styles.datePill} onPress={toggleTimeDisplayMode} hitSlop={8}>
          <Text style={styles.datePillText}>
            {formatDateDisplay(currentYear, timeDisplayMode, birthYear, birthMonth)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSettings} hitSlop={12}>
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Legend Panel ────────────────────────────────────────────────────────────

function LegendPanel() {
  const { activeSystems, toggleSystem, legendOpen } = useAppStore()
  const maxH = useRef(new Animated.Value(legendOpen ? 320 : 0)).current

  const prevOpen = useRef(legendOpen)
  if (prevOpen.current !== legendOpen) {
    prevOpen.current = legendOpen
    Animated.timing(maxH, {
      toValue: legendOpen ? 320 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }

  return (
    <Animated.View style={[styles.legendPanel, { maxHeight: maxH }]} pointerEvents={legendOpen ? 'auto' : 'none'}>
      <View style={styles.legendInner}>
        {ALL_SYSTEMS.map((id) => {
          const active = activeSystems.includes(id)
          const meta = SYSTEM_META[id]
          return (
            <TouchableOpacity
              key={id}
              style={styles.legendRow}
              onPress={() => toggleSystem(id)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.legendDot,
                { backgroundColor: meta.color },
                !active && { opacity: 0.3 },
              ]} />
              <Text style={[styles.legendLabel, !active && { opacity: 0.4 }]}>
                {meta.label}
              </Text>
              {active && <View style={[styles.legendGlow, { backgroundColor: meta.color }]} />}
            </TouchableOpacity>
          )
        })}
      </View>
    </Animated.View>
  )
}

// ─── Body SVG ─────────────────────────────────────────────────────────────────

function BodySvg({
  activeSystems, conditions, onConditionPress, currentYear,
  condDateOverrides, selectedCondition,
}: {
  activeSystems: SystemId[]
  conditions: DesignCondition[]
  onConditionPress: (c: DesignCondition) => void
  currentYear: number
  condDateOverrides: Record<string, string>
  selectedCondition: DesignCondition | null
}) {
  const visibleConds = conditions.filter((c) => {
    if (!activeSystems.includes(c.system)) return false
    const override = condDateOverrides[c.id]
    const frac = override ? parseFloat(override) : c.yearFrac
    return frac <= currentYear
  })

  return (
    <Svg width="100%" height="100%" viewBox="0 0 260 460" style={styles.bodySvg}>
      <Ellipse cx={130} cy={46} rx={34} ry={38} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} fill="rgba(255,255,255,0.03)" />
      <SvgPath d="M114 82 L114 102 M146 82 L146 102" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
      <SvgPath
        d="M82 102 Q62 118 59 168 L54 288 Q54 312 82 318 L82 392 Q82 410 100 410 L160 410 Q178 410 178 392 L178 318 Q206 312 206 288 L201 168 Q198 118 178 102 Z"
        stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} fill="rgba(255,255,255,0.03)"
      />
      <SvgPath d="M82 108 Q52 130 42 208 Q38 228 46 242 Q52 252 64 246 Q72 236 74 214 L78 152" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      <SvgPath d="M178 108 Q208 130 218 208 Q222 228 214 242 Q208 252 196 246 Q188 236 186 214 L182 152" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      <SvgPath d="M100 410 L92 498 Q90 520 104 520 Q118 520 120 498 L122 420" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      <SvgPath d="M160 410 L168 498 Q170 520 156 520 Q142 520 140 498 L138 420" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />

      {activeSystems.includes('cardio') && (
        <Ellipse cx={130} cy={178} rx={18} ry={20} fill={SYSTEM_META.cardio.color} opacity={0.18} />
      )}
      {activeSystems.includes('pulm') && (
        <G>
          <Ellipse cx={112} cy={172} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
          <Ellipse cx={148} cy={172} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
        </G>
      )}
      {activeSystems.includes('gi') && (
        <Ellipse cx={130} cy={242} rx={22} ry={30} fill={SYSTEM_META.gi.color} opacity={0.15} />
      )}
      {activeSystems.includes('renal') && (
        <G>
          <Ellipse cx={110} cy={218} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
          <Ellipse cx={150} cy={218} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
        </G>
      )}
      {activeSystems.includes('endo') && (
        <Ellipse cx={130} cy={132} rx={10} ry={7} fill={SYSTEM_META.endo.color} opacity={0.25} />
      )}
      {activeSystems.includes('neuro') && (
        <Ellipse cx={130} cy={46} rx={28} ry={32} fill={SYSTEM_META.neuro.color} opacity={0.12} />
      )}
      {activeSystems.includes('repro') && (
        <Ellipse cx={130} cy={308} rx={18} ry={14} fill={SYSTEM_META.repro.color} opacity={0.2} />
      )}
      {activeSystems.includes('muscle') && (
        <Ellipse cx={130} cy={220} rx={26} ry={60} fill={SYSTEM_META.muscle.color} opacity={0.06} />
      )}
      {activeSystems.includes('skeletal') && (
        <SvgPath d="M120 102 L120 392 M140 102 L140 392" stroke={SYSTEM_META.skeletal.color} strokeWidth={1} opacity={0.15} />
      )}
      {activeSystems.includes('lymph') && (
        <G>
          <Ellipse cx={130} cy={148} rx={7} ry={7} fill={SYSTEM_META.lymph.color} opacity={0.25} />
          <Ellipse cx={130} cy={272} rx={7} ry={7} fill={SYSTEM_META.lymph.color} opacity={0.25} />
        </G>
      )}
      {activeSystems.includes('integ') && (
        <Ellipse cx={130} cy={240} rx={58} ry={140} fill={SYSTEM_META.integ.color} opacity={0.04} />
      )}

      {/* Condition hotspot dots — G wrapper ensures onPress works on web */}
      {visibleConds.map((c) => {
        const isSelected = selectedCondition?.id === c.id
        const color = SYSTEM_META[c.system]?.color ?? '#fff'
        return (
          <G key={c.id} onPress={() => onConditionPress(c)}>
            <Circle cx={c.cx} cy={c.cy} r={isSelected ? 10 : 8}
              fill={color} fillOpacity={isSelected ? 1 : 0.75}
              stroke={C.bg} strokeWidth={1.5} />
            <Circle cx={c.cx} cy={c.cy} r={isSelected ? 4.5 : 3.5}
              fill="#fff" fillOpacity={0.95} />
          </G>
        )
      })}
    </Svg>
  )
}

// ─── Vertical Time Rail ──────────────────────────────────────────────────────

const RAIL_W_INACTIVE = 14
const RAIL_W_ACTIVE = 36
const IS_WEB = Platform.OS === 'web'

function VerticalTimeRail({ conditions }: { conditions: DesignCondition[] }) {
  const {
    currentYear, setCurrentYear, activeSystems,
    condDateOverrides, timeRailActive, setTimeRailActive,
    timeDisplayMode, birthYear, birthMonth, selectedCondition,
  } = useAppStore()

  const [railH, setRailH] = useState(SH * 0.6)
  const widthAnim = useRef(new Animated.Value(IS_WEB ? RAIL_W_ACTIVE : RAIL_W_INACTIVE)).current
  const didDrag = useRef(false)
  const wasActiveOnGrant = useRef(false)
  const railRef = useRef<View>(null)
  const railTopRef = useRef(0)
  const YEAR_BOOKENDS = [MIN_YEAR, MAX_YEAR]

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
    const rawYear = fromVertPos(clampedY, railH)
    const visible = conditions.filter((c) => activeSystems.includes(c.system))
    if (visible.length === 0) {
      setCurrentYear(rawYear)
      return
    }
    // Proximity is measured in pixels against each marker's on-rail position, so
    // the snap zone is visually uniform on the log-scaled rail (free-dragging
    // everywhere else). Snap only when within 1% of the rail height of a marker.
    let nearestFrac = visible[0].yearFrac
    let minPxDist = Infinity
    for (const c of visible) {
      const cFrac = condDateOverrides[c.id] ? parseFloat(condDateOverrides[c.id]) : c.yearFrac
      const pxDist = Math.abs(toVertPos(cFrac, railH) - clampedY)
      if (pxDist < minPxDist) { minPxDist = pxDist; nearestFrac = cFrac }
    }
    const threshold = railH * 0.01
    setCurrentYear(minPxDist <= threshold ? nearestFrac : rawYear)
  }

  // Window-level drag listeners (web). react-native-web's responder stops
  // emitting onResponderMove once the cursor leaves the narrow rail, so we
  // listen on window instead: the thumb follows the mouse anywhere on screen
  // until the button is released. snapRef keeps the latest closure (railH etc.).
  const snapRef = useRef(snapToNearest)
  snapRef.current = snapToNearest
  function beginWebDrag() {
    if (!IS_WEB) return
    railRef.current?.measureInWindow((_x, y) => { railTopRef.current = y })
    const onMove = (ev: MouseEvent) => {
      didDrag.current = true
      snapRef.current(ev.clientY - railTopRef.current)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const thumbTop = toVertPos(currentYear, railH)

  return (
    <Animated.View
      ref={railRef}
      style={[styles.railWrap, { width: widthAnim }]}
      onLayout={(e) => setRailH(e.nativeEvent.layout.height)}
      // box-only keeps THIS view as the responder target so locationY stays
      // relative to the rail; otherwise on web the cursor moving over child
      // dashes/thumb retargets the event and locationY jumps (discontinuous drag).
      pointerEvents="box-only"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e: GestureResponderEvent) => {
        wasActiveOnGrant.current = timeRailActive
        didDrag.current = false
        activateRail()
        snapToNearest(e.nativeEvent.locationY)
        // On web, take over the drag at the window level so it keeps following
        // the mouse even when the cursor leaves the rail (until mouseup).
        beginWebDrag()
      }}
      // Native uses the responder move; web is driven by window listeners
      // (beginWebDrag) so the drag continues outside the rail bounds.
      onResponderMove={IS_WEB ? undefined : (e: GestureResponderEvent) => {
        didDrag.current = true
        snapToNearest(e.nativeEvent.locationY)
      }}
      onResponderRelease={() => {
        if (!didDrag.current && wasActiveOnGrant.current) {
          // tap on already-active rail: collapse it
          deactivateRail()
        } else if (didDrag.current) {
          deactivateRail()
        }
        // tap on inactive rail: grant already activated it, leave it active
      }}
      onResponderTerminate={() => deactivateRail()}
    >
      <View style={styles.railTrack} />
      {conditions
        .filter((c) => activeSystems.includes(c.system))
        .map((c) => {
          const frac = condDateOverrides[c.id] ? parseFloat(condDateOverrides[c.id]) : c.yearFrac
          const top = toVertPos(frac, railH)
          const isSelected = selectedCondition?.id === c.id
          return (
            <View
              key={c.id}
              style={[
                styles.railDash,
                {
                  top: top - 1.5,
                  backgroundColor: SYSTEM_META[c.system]?.color ?? '#fff',
                  opacity: isSelected ? 1 : 0.7,
                },
              ]}
            />
          )
        })}
      {timeRailActive && YEAR_BOOKENDS.map((yr) => (
        <Text key={yr} style={[styles.railBookend, { top: toVertPos(yr, railH) - 8 }]}>
          {`'${String(yr).slice(2)}`}
        </Text>
      ))}
      <View style={[styles.railThumb, { top: thumbTop - 4 }]} />
      {timeRailActive && (
        <View style={[styles.railLabel, { top: Math.max(0, thumbTop - 14) }]}>
          <Text style={styles.railLabelText}>
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
              isSel && { shadowColor: rec.color, shadowRadius: 8, shadowOpacity: 0.4, elevation: 4 },
            ]}
          >
            {renderRecordThumb(rec, 117, 44)}
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
                <Svg width={9} height={9} viewBox="0 0 12 12">
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
  } = useAppStore()

  const condRecords = useConditionRecords(selectedCondition?.id)

  const sheetTranslateY = useRef(new Animated.Value(1)).current // 1 = off-screen
  const [disclaimerShown, setDisclaimerShown] = useState(false)

  const prevOpen = useRef(false)
  if (prevOpen.current !== sheetOpen) {
    prevOpen.current = sheetOpen
    Animated.timing(sheetTranslateY, {
      toValue: sheetOpen ? 0 : 1,
      duration: 420,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start()
  }

  // Disclaimer must precede the first chat message every session (cannot be
  // permanently dismissed).
  useEffect(() => {
    if (chatOpen && sheetOpen && !disclaimerShown) {
      addChatMessage({ role: 'assistant', content: DISCLAIMER })
      setDisclaimerShown(true)
    }
  }, [chatOpen, sheetOpen])

  const sheetH = chatOpen ? 780 : 400
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
      const { getChatCompletion } = await import('@/lib/llm/client')
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
      const reply = await getChatCompletion(userMsg, sys)
      addChatMessage({ role: 'assistant', content: reply })
    } catch {
      addChatMessage({ role: 'assistant', content: 'Unable to connect. Check network and API key in Settings.' })
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
        },
      ]}
      pointerEvents={sheetOpen ? 'auto' : 'none'}
    >
      <View style={styles.sheetHandle} />

      {/* Compact header */}
      <View style={styles.sheetHeader}>
        {meta && <View style={[styles.sysDot, { backgroundColor: meta.color }]} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetCondName} numberOfLines={1}>
            {selectedCondition ? localName : 'Health assistant'}
          </Text>
          {selectedCondition && (
            <Text style={styles.sheetCondSub} numberOfLines={1}>
              {preferredLanguage !== 'en' ? `${selectedCondition.label} · ` : ''}{selectedCondition.medName}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={closeSheet} hitSlop={12}>
          <Text style={styles.sheetCloseBtn}>↓</Text>
        </TouchableOpacity>
      </View>

      {!chatOpen && selectedCondition && (
        <>
          <Text style={styles.sheetCondNameLarge}>{localName}</Text>
          <Text style={styles.sheetCondSubEn}>{selectedCondition.medName}</Text>

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
                  <Text style={styles.datePencil}>✎</Text>
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
          {condRecords.length > 0 && <RecordsCarousel records={condRecords} />}
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
            {chatMessages.map((msg, i) => (
              <View
                key={i}
                style={[styles.chatBubble, msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssist]}
              >
                <Text style={[styles.chatBubbleText, msg.role === 'user' && styles.chatBubbleUserText]}>
                  {msg.content}
                </Text>
              </View>
            ))}
            {chatLoading && (
              <View style={styles.chatBubbleAssist}>
                <Text style={styles.chatBubbleText}>●●●</Text>
              </View>
            )}
          </ScrollView>

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
          {renderRecordThumb(rec, 358, 226)}
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

function SettingsSheet() {
  const insets = useSafeAreaInsets()
  const {
    settingsOpen, toggleSettings,
    preferredLanguage, setPreferredLanguage,
    birthYear, setBirthYear,
    birthMonth, setBirthMonth,
  } = useAppStore()

  const anim = useRef(new Animated.Value(0)).current
  const prevOpen = useRef(false)
  if (prevOpen.current !== settingsOpen) {
    prevOpen.current = settingsOpen
    Animated.timing(anim, {
      toValue: settingsOpen ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] })
  const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

  return (
    <Animated.View
      style={[styles.settingsSheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}
      pointerEvents={settingsOpen ? 'auto' : 'none'}
    >
      <View style={styles.sheetHandle} />
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <TouchableOpacity onPress={toggleSettings} hitSlop={12}>
          <Text style={styles.sheetCloseBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.settingsSectionLabel}>Language</Text>
      <ScrollView style={styles.langList} showsVerticalScrollIndicator={false}>
        {SUPPORTED_LANGS.map(({ code, flag, native, english }) => {
          const active = preferredLanguage === code
          return (
            <TouchableOpacity
              key={code}
              style={[styles.langRowItem, active && styles.langRowItemActive]}
              onPress={() => setPreferredLanguage(code)}
            >
              <Text style={styles.langFlag}>{flag}</Text>
              <Text style={styles.langNative}>{native}</Text>
              <Text style={styles.langEnglish}>{english}</Text>
              {active && <Text style={styles.langCheck}>✓</Text>}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <Text style={styles.settingsSectionLabel}>Date of birth</Text>
      <View style={styles.dobRow}>
        <TextInput
          style={styles.dobYearInput}
          value={String(birthYear)}
          onChangeText={(v) => { const n = parseInt(v); if (n > 1900 && n < 2020) setBirthYear(n) }}
          keyboardType="numeric"
          maxLength={4}
          placeholderTextColor={C.inkMuted}
        />
        <View style={styles.dobMonthWrap}>
          {MONTHS_SHORT.map((mo) => (
            <TouchableOpacity
              key={mo}
              style={[styles.monthChip, birthMonth === mo && styles.monthChipActive]}
              onPress={() => setBirthMonth(mo)}
            >
              <Text style={[styles.monthChipText, birthMonth === mo && styles.monthChipTextActive]}>{mo}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Upload Shortcuts ─────────────────────────────────────────────────────────

function UploadShortcuts() {
  const {
    uploadPanelOpen, setUploadPanelOpen, uploadBtnsHovered, setUploadBtnsHovered,
    startAnalyze, openHealthChat,
  } = useAppStore()

  const btnsOpacity = !uploadPanelOpen ? 0 : uploadBtnsHovered ? 0.85 : 0.2

  return (
    <View style={styles.uploadWrap}>
      {uploadPanelOpen && (
        <Pressable
          style={[styles.uploadBtns, { opacity: btnsOpacity }]}
          onHoverIn={() => setUploadBtnsHovered(true)}
          onHoverOut={() => setUploadBtnsHovered(false)}
        >
          <TouchableOpacity style={styles.uploadShortcut} onPress={startAnalyze}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <SvgPath d="M7 3h7l4 4v14H7z" stroke={C.purpleLight} strokeWidth={1.6} fill="none" />
              <SvgPath d="M14 3v4h4" stroke={C.purpleLight} strokeWidth={1.6} fill="none" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadShortcut} onPress={startAnalyze}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Rect x={3} y={7} width={18} height={13} rx={2} stroke={C.aqua} strokeWidth={1.6} fill="none" />
              <Circle cx={12} cy={13} r={3.2} stroke={C.aqua} strokeWidth={1.6} fill="none" />
              <SvgPath d="M8 7l1.5-2h5L16 7" stroke={C.aqua} strokeWidth={1.6} fill="none" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadShortcut} onPress={startAnalyze}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Rect x={3} y={4} width={18} height={16} rx={2} stroke={C.purpleLight} strokeWidth={1.6} fill="none" />
              <Circle cx={8.5} cy={9} r={1.6} fill={C.purpleLight} />
              <SvgPath d="M5 18l5-5 4 3 3-3 4 4" stroke={C.purpleLight} strokeWidth={1.6} fill="none" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadShortcutChat} onPress={openHealthChat}>
            <ChatBubbleIcon color={C.purpleLight} size={14} />
          </TouchableOpacity>
        </Pressable>
      )}
      <TouchableOpacity style={styles.qsWordmark} onPress={() => setUploadPanelOpen(!uploadPanelOpen)}>
        <QSWordmark size={28} onDark={true} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function BodyMapScreen() {
  const {
    activeSystems, selectCondition,
    currentYear, sheetOpen, settingsOpen,
    condDateOverrides, selectedCondition,
  } = useAppStore()

  const conditions = useConditions()

  const handleConditionPress = useCallback((c: DesignCondition) => {
    selectCondition(c)
  }, [selectCondition])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <NavBar />

        <View style={styles.canvas}>
          <View style={styles.bodyWrap}>
            <BodySvg
              activeSystems={activeSystems}
              conditions={conditions}
              onConditionPress={handleConditionPress}
              currentYear={currentYear}
              condDateOverrides={condDateOverrides}
              selectedCondition={selectedCondition}
            />
          </View>

          <LegendPanel />
          <VerticalTimeRail conditions={conditions} />
          <UploadShortcuts />
        </View>
      </SafeAreaView>

      <ConditionSheet />
      <SettingsSheet />
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
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 0 },
  logoM: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  logoAI: { fontFamily: 'MOMCAKE-Bold', fontSize: 20, color: '#8A60EB', lineHeight: 20 },
  logoGenki: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  navChevron: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.4)', marginLeft: 4, transform: [{ rotate: '90deg' }] },
  navChevronOpen: { transform: [{ rotate: '270deg' }] },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  datePill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  datePillText: { fontFamily: 'SourceCodePro', fontSize: 11, color: C.ink },
  gearIcon: { fontSize: 18, color: 'rgba(255,255,255,0.45)' },

  canvas: { flex: 1, position: 'relative', overflow: 'hidden' },

  bodyWrap: { position: 'absolute', top: '2.5%', left: 0, right: RAIL_W_INACTIVE, bottom: 0 },
  bodySvg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  legendPanel: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: 'rgba(10,12,20,0.92)', overflow: 'hidden', zIndex: 5, minWidth: 140,
  },
  legendInner: { paddingVertical: 10, paddingHorizontal: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendGlow: { position: 'absolute', right: 0, width: 6, height: 6, borderRadius: 3, opacity: 0.5 },
  legendLabel: { fontFamily: 'BarlowCondensed-Regular', fontSize: 12, color: C.ink, flex: 1 },

  railWrap: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'visible', zIndex: 3,
  },
  railTrack: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  railDash: { position: 'absolute', left: 3, right: 3, height: 3, borderRadius: 1.5 },
  railThumb: {
    position: 'absolute', left: '50%', marginLeft: -4, width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.aqua, shadowColor: C.aqua, shadowOpacity: 0.8, shadowRadius: 4, elevation: 4,
  },
  railLabel: { position: 'absolute', right: RAIL_W_ACTIVE + 4, backgroundColor: 'rgba(10,12,20,0.9)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  railLabelText: { fontFamily: 'SourceCodePro', fontSize: 9, color: C.aqua },
  railBookend: { position: 'absolute', right: 2, fontFamily: 'SourceCodePro', fontSize: 8, color: 'rgba(255,255,255,0.3)' },

  // Condition sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 16,
    elevation: 20, zIndex: 10,
  },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sysDot: { width: 8, height: 8, borderRadius: 4 },
  sheetCondName: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 14, color: C.ink, flex: 1 },
  sheetCondSub: { fontFamily: 'BarlowCondensed-Regular', fontSize: 11, color: C.inkMuted },
  sheetCloseBtn: { fontSize: 18, color: C.inkMuted, padding: 4 },

  sheetCondNameLarge: { fontFamily: 'MOMCAKE-Bold', fontSize: 26, color: C.ink, marginBottom: 4 },
  sheetCondSubEn: { fontFamily: 'BarlowCondensed-Regular', fontSize: 13, color: C.inkMuted, marginBottom: 10 },

  sheetDateRow: { marginBottom: 12 },
  dateViewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetDateChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(31,195,164,0.12)' },
  sheetDateText: { fontFamily: 'SourceCodePro', fontSize: 12, color: C.aqua },
  datePencilBtn: { padding: 4 },
  datePencil: { fontSize: 14, color: C.inkMuted },
  dateEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateEditInput: {
    width: 160, height: 34, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(31,195,164,0.4)',
    paddingHorizontal: 10, fontFamily: 'SourceCodePro', fontSize: 13, color: C.aqua, backgroundColor: C.surfaceHigh,
  },
  dateEditBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHigh },
  dateEditConfirm: { color: C.aqua, fontSize: 16, fontWeight: '700' },
  dateEditCancel: { color: C.inkMuted, fontSize: 14 },

  sheetNote: { fontFamily: 'BarlowCondensed-Regular', fontSize: 16, color: C.ink, lineHeight: 22, marginBottom: 14 },

  // Source block (3 lines)
  sourceBlock: { marginBottom: 8 },
  sourceLine1: { marginBottom: 3 },
  sourceLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: 1.8 },
  sourceMeta: { fontFamily: 'SourceCodePro', fontSize: 10, color: 'rgba(255,255,255,0.32)' },
  sourceLine2: { fontFamily: 'SourceCodePro', fontSize: 10, color: 'rgba(255,255,255,0.32)', marginBottom: 4 },
  sourceLine3: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceDoctor: { fontFamily: 'SourceCodePro', fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.65)' },
  sourceIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  sheetFooterRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  chatFooterBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#8A60EB', alignItems: 'center', justifyContent: 'center' },

  // Records carousel
  carousel: { maxHeight: 84, marginBottom: 6 },
  carouselContent: { paddingHorizontal: 10, gap: 9, alignItems: 'center' },
  recordCard: { width: 117, height: 74, borderRadius: 6, borderWidth: 1.5, overflow: 'hidden' },
  recordCardFooter: { paddingHorizontal: 6, paddingTop: 2 },
  recordCardLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 10, color: C.ink },
  recordCardDate: { fontFamily: 'SourceCodePro', fontSize: 8, color: C.inkMuted },
  recordSelCircle: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  // Chat
  chatScroll: { flex: 1 },
  chatContent: { padding: 12, gap: 10 },
  chatBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: C.purpleTint, borderRadius: 12, borderBottomRightRadius: 2 },
  chatBubbleAssist: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderBottomLeftRadius: 2 },
  chatBubbleText: { fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: C.ink, lineHeight: 20 },
  chatBubbleUserText: { color: '#fff' },
  chatInputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  chatInput: {
    flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12, fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: C.ink, backgroundColor: C.surfaceHigh,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: C.purpleLight },
  sendBtnText: { color: C.ink, fontSize: 18, fontWeight: '700' },

  // Lightbox
  lightbox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(10,12,20,0.96)', alignItems: 'center', justifyContent: 'center' },
  lightboxContent: { width: 390, maxWidth: '92%', backgroundColor: C.surface, borderRadius: 16, padding: 16 },
  lightboxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  lightboxBadge: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  lightboxClose: { fontSize: 18, color: C.inkMuted },
  lightboxThumb: { borderRadius: 8, overflow: 'hidden', alignSelf: 'center', marginBottom: 12 },
  lightboxLabel: { fontFamily: 'MOMCAKE-Bold', fontSize: 20, color: C.ink },
  lightboxDate: { fontFamily: 'SourceCodePro', fontSize: 11, color: C.inkMuted, marginBottom: 14 },
  lightboxAddBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.purpleLight },
  lightboxAddText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#fff', letterSpacing: 0.3 },

  // Settings
  settingsSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, zIndex: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 20,
  },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  settingsTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsSectionLabel: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 10, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  langList: { maxHeight: 224, marginBottom: 20 },
  langRowItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10,
    borderLeftWidth: 3, borderLeftColor: 'transparent', borderRadius: 6,
  },
  langRowItemActive: { borderLeftColor: C.purpleLight, backgroundColor: 'rgba(138,96,235,0.12)' },
  langFlag: { fontSize: 20 },
  langNative: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, fontWeight: '500', color: C.ink },
  langEnglish: { fontFamily: 'SourceCodePro', fontSize: 9.5, color: C.inkMuted, flex: 1 },
  langCheck: { fontSize: 14, color: C.purpleLight },

  dobRow: { gap: 10, marginBottom: 20 },
  dobYearInput: {
    height: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 12,
    fontFamily: 'SourceCodePro', fontSize: 14, color: C.ink, backgroundColor: C.surfaceHigh, width: 80,
  },
  dobMonthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  monthChipActive: { backgroundColor: C.purpleLight, borderColor: C.purpleLight },
  monthChipText: { fontFamily: 'SourceCodePro', fontSize: 9, color: C.inkMuted },
  monthChipTextActive: { color: '#fff' },

  // Upload shortcuts
  uploadWrap: { position: 'absolute', bottom: 20, left: 16, alignItems: 'center', zIndex: 4 },
  uploadBtns: { gap: 8, alignItems: 'center', marginBottom: 8 },
  uploadShortcut: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  uploadShortcutChat: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(138,96,235,0.12)', borderWidth: 1, borderColor: 'rgba(138,96,235,0.3)', alignItems: 'center', justifyContent: 'center' },
  qsWordmark: { opacity: 0.3 },

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9 },
})
