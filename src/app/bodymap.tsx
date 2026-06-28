import { useCallback, useRef, useState } from 'react'
import {
  Animated, Dimensions, Easing, GestureResponderEvent,
  KeyboardAvoidingView, Platform, PanResponder,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Ellipse, Path as SvgPath } from 'react-native-svg'
import { QSWordmark } from '@/components/QSWordmark'
import { router } from 'expo-router'
import { useAppStore } from '@/store/useAppStore'
import {
  ALL_SYSTEMS, CONDITIONS, DesignCondition, SystemId,
  SYSTEM_META, SupportedLang, getLocalName,
} from '@/model/conditions'

const { width: SW, height: SH } = Dimensions.get('window')

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

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const SUPPORTED_LANGS: { code: SupportedLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
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

// Returns pixel top offset within a rail of given height (newest at top)
function toVertPos(yearFrac: number, railH: number): number {
  return (1 - toLogFrac(yearFrac)) * railH
}

function fromVertPos(posY: number, railH: number): number {
  if (railH <= 0) return MAX_YEAR
  const frac = 1 - posY / railH
  const clamped = Math.max(0, Math.min(1, frac))
  // Invert log: t = ln(frac*(e^K-1)+1) / K
  const t = Math.log(clamped * (Math.exp(K) - 1) + 1) / K
  return MIN_YEAR + t * (MAX_YEAR - MIN_YEAR)
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function NavBar() {
  const {
    currentYear, timeDisplayMode, birthYear,
    toggleTimeDisplayMode, toggleSettings, toggleLegend, legendOpen,
    preferredLanguage,
  } = useAppStore()

  function fmtDatePill() {
    if (timeDisplayMode === 'date') {
      const yr = Math.floor(currentYear)
      const mo = MONTHS_SHORT[Math.round((currentYear - yr) * 12)]
      return mo ? `${yr}-${mo}` : `${yr}`
    }
    return `AGE ${(currentYear - birthYear).toFixed(1)}`
  }

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
          <Text style={styles.datePillText}>{fmtDatePill()}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSettings} hitSlop={12}>
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── View Tabs ────────────────────────────────────────────────────────────────

function ViewTabs() {
  const { bodyMapMode, setBodyMapMode } = useAppStore()
  return (
    <View style={styles.tabBar}>
      {(['body', 'list'] as const).map((mode) => {
        const label = mode === 'body' ? 'Body Map' : 'Timeline'
        const active = bodyMapMode === mode
        return (
          <TouchableOpacity key={mode} style={styles.tabItem} onPress={() => setBodyMapMode(mode)}>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            {active && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Legend Panel (absolute overlay, slides from top) ────────────────────────

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
        {ALL_SYSTEMS.map((id, idx) => {
          const active = activeSystems.includes(id)
          const meta = SYSTEM_META[id]
          const isAlwaysOn = idx === 0
          return (
            <TouchableOpacity
              key={id}
              style={styles.legendRow}
              onPress={isAlwaysOn ? undefined : () => toggleSystem(id)}
              activeOpacity={isAlwaysOn ? 1 : 0.7}
            >
              <View style={[
                styles.legendDot,
                { backgroundColor: meta.color },
                (!active || isAlwaysOn) && { opacity: 0.3 },
              ]} />
              <Text style={[styles.legendLabel, (!active || isAlwaysOn) && { opacity: 0.4 }]}>
                {meta.label}
              </Text>
              {active && !isAlwaysOn && <View style={[styles.legendGlow, { backgroundColor: meta.color }]} />}
            </TouchableOpacity>
          )
        })}
      </View>
    </Animated.View>
  )
}

// ─── Body SVG ─────────────────────────────────────────────────────────────────

function BodySvg({
  activeSystems,
  conditions,
  onConditionPress,
  currentYear,
  condDateOverrides,
  selectedCondition,
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
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 260 460"
      style={styles.bodySvg}
    >
      {/* Ghost silhouette — always visible, Integumentary */}
      {/* Head */}
      <Ellipse cx={130} cy={46} rx={34} ry={38} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} fill="rgba(255,255,255,0.03)" />
      {/* Neck */}
      <SvgPath d="M114 82 L114 102 M146 82 L146 102" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
      {/* Torso */}
      <Path
        d="M82 102 Q62 118 59 168 L54 288 Q54 312 82 318 L82 392 Q82 410 100 410 L160 410 Q178 410 178 392 L178 318 Q206 312 206 288 L201 168 Q198 118 178 102 Z"
        stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} fill="rgba(255,255,255,0.03)"
      />
      {/* Arms */}
      <SvgPath d="M82 108 Q52 130 42 208 Q38 228 46 242 Q52 252 64 246 Q72 236 74 214 L78 152"
        stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      <SvgPath d="M178 108 Q208 130 218 208 Q222 228 214 242 Q208 252 196 246 Q188 236 186 214 L182 152"
        stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      {/* Legs */}
      <SvgPath d="M100 410 L92 498 Q90 520 104 520 Q118 520 120 498 L122 420"
        stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />
      <SvgPath d="M160 410 L168 498 Q170 520 156 520 Q142 520 140 498 L138 420"
        stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} fill="transparent" />

      {/* Organ system tints */}
      {activeSystems.includes('cardio') && (
        <Ellipse cx={130} cy={178} rx={18} ry={20} fill={SYSTEM_META.cardio.color} opacity={0.18} />
      )}
      {activeSystems.includes('pulm') && (
        <>
          <Ellipse cx={112} cy={172} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
          <Ellipse cx={148} cy={172} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
        </>
      )}
      {activeSystems.includes('gi') && (
        <Ellipse cx={130} cy={242} rx={22} ry={30} fill={SYSTEM_META.gi.color} opacity={0.15} />
      )}
      {activeSystems.includes('renal') && (
        <>
          <Ellipse cx={110} cy={218} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
          <Ellipse cx={150} cy={218} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
        </>
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
        <>
          <Ellipse cx={130} cy={148} rx={7} ry={7} fill={SYSTEM_META.lymph.color} opacity={0.25} />
          <Ellipse cx={130} cy={272} rx={7} ry={7} fill={SYSTEM_META.lymph.color} opacity={0.25} />
        </>
      )}
      {activeSystems.includes('integ') && (
        <Ellipse cx={130} cy={240} rx={58} ry={140} fill={SYSTEM_META.integ.color} opacity={0.04} />
      )}

      {/* Condition dots */}
      {visibleConds.map((c) => {
        const isSelected = selectedCondition?.id === c.id
        const color = SYSTEM_META[c.system].color
        return (
          <Circle
            key={c.id}
            cx={c.cx}
            cy={c.cy}
            r={isSelected ? 10 : 8}
            fill={color}
            fillOpacity={isSelected ? 1 : 0.75}
            stroke={C.bg}
            strokeWidth={1.5}
            onPress={() => onConditionPress(c)}
          />
        )
      })}

      {/* White inner dot for selected */}
      {visibleConds.filter((c) => c.id === selectedCondition?.id).map((c) => (
        <Circle key={`dot-${c.id}`} cx={c.cx} cy={c.cy} r={4.5} fill="rgba(255,255,255,0.9)" />
      ))}
    </Svg>
  )
}

// ─── Vertical Time Rail (right edge) ─────────────────────────────────────────

const RAIL_W_INACTIVE = 14
const RAIL_W_ACTIVE = 36

function VerticalTimeRail({ conditions }: { conditions: DesignCondition[] }) {
  const {
    currentYear, setCurrentYear, activeSystems,
    condDateOverrides, timeRailActive, setTimeRailActive,
    timeDisplayMode, birthYear,
  } = useAppStore()

  const [railH, setRailH] = useState(SH * 0.6)
  const railRef = useRef<View>(null)
  const widthAnim = useRef(new Animated.Value(RAIL_W_INACTIVE)).current

  const YEAR_BOOKENDS = [MIN_YEAR, MAX_YEAR]

  function activateRail() {
    Animated.timing(widthAnim, {
      toValue: RAIL_W_ACTIVE,
      duration: 220,
      useNativeDriver: false,
    }).start()
    setTimeRailActive(true)
  }

  function deactivateRail() {
    Animated.timing(widthAnim, {
      toValue: RAIL_W_INACTIVE,
      duration: 220,
      useNativeDriver: false,
    }).start()
    setTimeRailActive(false)
  }

  function snapToNearest(posY: number) {
    const rawYear = fromVertPos(posY, railH)
    const visible = conditions.filter((c) => activeSystems.includes(c.system))
    if (visible.length === 0) {
      setCurrentYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, rawYear)))
      return
    }
    // Find nearest condition within 1% threshold
    let nearest = visible[0]
    let minDist = Infinity
    for (const c of visible) {
      const cFrac = condDateOverrides[c.id] ? parseFloat(condDateOverrides[c.id]) : c.yearFrac
      const dist = Math.abs(cFrac - rawYear)
      if (dist < minDist) { minDist = dist; nearest = c }
    }
    const threshold = (MAX_YEAR - MIN_YEAR) * 0.01
    const nearestFrac = condDateOverrides[nearest.id] ? parseFloat(condDateOverrides[nearest.id]) : nearest.yearFrac
    setCurrentYear(minDist < threshold ? nearestFrac : Math.max(MIN_YEAR, Math.min(MAX_YEAR, rawYear)))
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        activateRail()
        snapToNearest(e.nativeEvent.locationY)
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        snapToNearest(e.nativeEvent.locationY)
      },
      onPanResponderRelease: () => {
        deactivateRail()
      },
    })
  ).current

  function fmtLabel(yr: number) {
    if (timeDisplayMode === 'age') return `AGE ${(yr - birthYear).toFixed(1)}`
    const y = Math.floor(yr)
    const mo = MONTHS_SHORT[Math.round((yr - y) * 12)] ?? ''
    return `${y}-${mo}`
  }

  const thumbTop = toVertPos(currentYear, railH)

  return (
    <Animated.View
      style={[styles.railWrap, { width: widthAnim }]}
      onLayout={(e) => setRailH(e.nativeEvent.layout.height)}
      ref={railRef}
      {...panResponder.panHandlers}
    >
      {/* Track line */}
      <View style={styles.railTrack} />

      {/* Condition dashes */}
      {conditions
        .filter((c) => activeSystems.includes(c.system))
        .map((c) => {
          const frac = condDateOverrides[c.id] ? parseFloat(condDateOverrides[c.id]) : c.yearFrac
          const top = toVertPos(frac, railH)
          const isSelected = false // TODO: wire selectedCondition
          return (
            <View
              key={c.id}
              style={[
                styles.railDash,
                {
                  top: top - 1.5,
                  backgroundColor: SYSTEM_META[c.system].color,
                  opacity: isSelected ? 1 : 0.7,
                },
              ]}
            />
          )
        })}

      {/* Bookend year labels (active only) */}
      {timeRailActive && YEAR_BOOKENDS.map((yr) => (
        <Text key={yr} style={[styles.railBookend, { top: toVertPos(yr, railH) - 8 }]}>
          {`'${String(yr).slice(2)}`}
        </Text>
      ))}

      {/* Thumb */}
      <View style={[styles.railThumb, { top: thumbTop - 4 }]} />

      {/* Floating year label */}
      {timeRailActive && (
        <View style={[styles.railLabel, { top: Math.max(0, thumbTop - 14) }]}>
          <Text style={styles.railLabelText}>{fmtLabel(currentYear)}</Text>
        </View>
      )}
    </Animated.View>
  )
}

// ─── Timeline List View ────────────────────────────────────────────────────────

function TimelineList() {
  const { activeSystems, selectCondition, preferredLanguage, condDateOverrides } = useAppStore()

  const sorted = CONDITIONS
    .filter((c) => activeSystems.includes(c.system))
    .slice()
    .sort((a, b) => {
      const fa = condDateOverrides[a.id] ? parseFloat(condDateOverrides[a.id]) : a.yearFrac
      const fb = condDateOverrides[b.id] ? parseFloat(condDateOverrides[b.id]) : b.yearFrac
      return fb - fa
    })

  return (
    <ScrollView style={styles.timelineList} showsVerticalScrollIndicator={false}>
      {sorted.map((c) => {
        const meta = SYSTEM_META[c.system]
        const name = getLocalName(c, preferredLanguage)
        return (
          <TouchableOpacity key={c.id} style={styles.timelineRow} onPress={() => selectCondition(c)}>
            <View style={[styles.timelineColorBar, { backgroundColor: meta.color }]} />
            <View style={styles.timelineRowContent}>
              <View style={styles.timelineRowTop}>
                <Text style={styles.timelineDateChip}>{c.date}</Text>
                <View style={[styles.timelineSysTag, { borderColor: meta.color + '60' }]}>
                  <Text style={[styles.timelineSysText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={styles.timelineCondName}>{name}</Text>
              {preferredLanguage !== 'en' && (
                <Text style={styles.timelineMedName}>{c.medName}</Text>
              )}
            </View>
            <Text style={styles.timelineChevron}>›</Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ─── Condition Sheet ──────────────────────────────────────────────────────────

const DISCLAIMER = 'Educational only. Not medical advice. Never a substitute for professional clinical judgment.'

function ConditionSheet() {
  const insets = useSafeAreaInsets()
  const {
    selectedCondition, sheetOpen, closeSheet,
    chatOpen, setChatOpen, chatMessages, addChatMessage,
    chatInputVal, setChatInputVal, chatLoading, setChatLoading,
    preferredLanguage,
  } = useAppStore()

  const sheetAnim = useRef(new Animated.Value(0)).current
  const [disclaimerShown, setDisclaimerShown] = useState(false)

  const prevOpen = useRef(false)
  if (prevOpen.current !== sheetOpen) {
    prevOpen.current = sheetOpen
    Animated.timing(sheetAnim, {
      toValue: sheetOpen ? 1 : 0,
      duration: 420,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start()
  }

  const sheetH = chatOpen ? SH * 0.9 : 400
  const translateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetH + 60, 0],
  })

  async function sendMessage() {
    if (!chatInputVal.trim() || chatLoading || !selectedCondition) return
    const userMsg = chatInputVal.trim()
    setChatInputVal('')
    addChatMessage({ role: 'user', content: userMsg })
    setChatLoading(true)
    try {
      const { getChatCompletion } = await import('@/lib/llm/client')
      const systemPrompt = [
        `You are a helpful health educator. The user is asking about: ${selectedCondition.label} (${selectedCondition.medName}).`,
        'Provide clear, accurate educational information. Never recommend specific treatments, dosages, or medications.',
        'Always remind users to consult their healthcare provider for personal medical advice.',
        DISCLAIMER,
      ].join('\n')
      const reply = await getChatCompletion(userMsg, systemPrompt)
      addChatMessage({ role: 'assistant', content: reply })
    } catch {
      addChatMessage({ role: 'assistant', content: 'Unable to connect. Check network and API key in Settings.' })
    } finally {
      setChatLoading(false)
    }
  }

  function openChat() {
    if (!disclaimerShown) {
      addChatMessage({ role: 'assistant', content: DISCLAIMER })
      setDisclaimerShown(true)
    }
    setChatOpen(true)
  }

  if (!selectedCondition) return null

  const localName = getLocalName(selectedCondition, preferredLanguage)
  const meta = SYSTEM_META[selectedCondition.system]

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetH,
          borderRadius: chatOpen ? 0 : 18,
          paddingBottom: insets.bottom + 12,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* Handle */}
      <View style={styles.sheetHandle} />

      {/* Compact header — always visible */}
      <View style={styles.sheetHeader}>
        <View style={[styles.sysDot, { backgroundColor: meta.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetCondName} numberOfLines={1}>
            {localName}
          </Text>
          <Text style={styles.sheetCondSub} numberOfLines={1}>
            {preferredLanguage !== 'en' ? `${selectedCondition.label} · ` : ''}{selectedCondition.medName}
          </Text>
        </View>
        {chatOpen ? (
          <TouchableOpacity onPress={closeSheet} hitSlop={12}>
            <Text style={styles.sheetCloseBtn}>↓</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.chatOpenBtn, { backgroundColor: C.purpleLight }]}
            onPress={openChat}
          >
            <Text style={styles.chatOpenBtnText}>💬</Text>
          </TouchableOpacity>
        )}
      </View>

      {!chatOpen && (
        <>
          {/* Detail content */}
          <Text style={styles.sheetCondNameLarge}>{localName}</Text>
          <Text style={styles.sheetCondSubEn}>{selectedCondition.medName}</Text>

          <View style={styles.sheetDateRow}>
            <View style={styles.sheetDateChip}>
              <Text style={styles.sheetDateText}>📅 {selectedCondition.date}</Text>
            </View>
          </View>

          <Text style={styles.sheetNote}>{selectedCondition.note}</Text>
          <Text style={styles.sheetEvidence}>
            {selectedCondition.evidence.split(' — ')[0]}
          </Text>

          <TouchableOpacity style={styles.chatCta} onPress={openChat}>
            <Text style={styles.chatCtaText}>Ask about this condition</Text>
          </TouchableOpacity>
        </>
      )}

      {chatOpen && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            {chatMessages.length === 0 && (
              <Text style={styles.chatEmpty}>Ask anything about {localName}.</Text>
            )}
            {chatMessages.map((msg, i) => (
              <View
                key={i}
                style={[
                  styles.chatBubble,
                  msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssist,
                ]}
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
              placeholder={`Ask about ${localName}…`}
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

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, 0],
  })

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
      <View style={styles.langRow}>
        {SUPPORTED_LANGS.map(({ code, label }) => (
          <TouchableOpacity
            key={code}
            style={[styles.langPill, preferredLanguage === code && styles.langPillActive]}
            onPress={() => setPreferredLanguage(code)}
          >
            <Text style={[styles.langPillText, preferredLanguage === code && styles.langPillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.settingsSectionLabel}>Date of birth</Text>
      <View style={styles.dobRow}>
        <TextInput
          style={styles.dobYearInput}
          value={String(birthYear)}
          onChangeText={(v) => { const n = parseInt(v); if (n > 1900 && n < 2020) setBirthYear(n) }}
          keyboardType="numeric"
          maxLength={4}
          placeholderTextColor={C.inkMuted}
          color={C.ink}
        />
        <View style={styles.dobMonthWrap}>
          {MONTHS_SHORT.map((mo) => (
            <TouchableOpacity
              key={mo}
              style={[styles.monthChip, birthMonth === mo && styles.monthChipActive]}
              onPress={() => setBirthMonth(mo)}
            >
              <Text style={[styles.monthChipText, birthMonth === mo && styles.monthChipTextActive]}>
                {mo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Upload Shortcuts (lower-left) ───────────────────────────────────────────

function UploadShortcuts() {
  const { uploadPanelOpen, setUploadPanelOpen } = useAppStore()

  return (
    <View style={styles.uploadWrap}>
      {uploadPanelOpen && (
        <View style={styles.uploadBtns}>
          <TouchableOpacity style={styles.uploadShortcut} onPress={() => router.replace('/')}>
            <Text style={styles.uploadShortcutIcon}>📄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadShortcut} onPress={() => router.replace('/')}>
            <Text style={styles.uploadShortcutIcon}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadShortcut} onPress={() => router.replace('/')}>
            <Text style={styles.uploadShortcutIcon}>🖼</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        style={styles.qsWordmark}
        onPress={() => setUploadPanelOpen(!uploadPanelOpen)}
      >
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
    condDateOverrides, selectedCondition, bodyMapMode,
  } = useAppStore()

  const handleConditionPress = useCallback((c: DesignCondition) => {
    selectCondition(c)
  }, [selectCondition])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <NavBar />
        <ViewTabs />

        {/* Main canvas — position:relative for all absolute children */}
        <View style={styles.canvas}>
          {/* Body SVG — always rendered, hidden behind list overlay */}
          <View style={styles.bodyWrap} pointerEvents={bodyMapMode === 'body' ? 'auto' : 'none'}>
            <BodySvg
              activeSystems={activeSystems}
              conditions={CONDITIONS}
              onConditionPress={handleConditionPress}
              currentYear={currentYear}
              condDateOverrides={condDateOverrides}
              selectedCondition={selectedCondition}
            />
          </View>

          {/* Timeline list overlay */}
          {bodyMapMode === 'list' && <TimelineList />}

          {/* Legend — absolute, top-left, slides down */}
          <LegendPanel />

          {/* Vertical time rail — absolute, right edge */}
          <VerticalTimeRail conditions={CONDITIONS} />

          {/* Upload shortcuts — absolute, lower-left */}
          <UploadShortcuts />
        </View>
      </SafeAreaView>

      {/* Condition sheet */}
      {sheetOpen && <ConditionSheet />}

      {/* Settings sheet */}
      {settingsOpen && <SettingsSheet />}

      {/* Backdrop */}
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

  // Nav bar
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 0 },
  logoM: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  logoAI: { fontFamily: 'MOMCAKE-Bold', fontSize: 20, color: '#8A60EB', lineHeight: 20 },
  logoGenki: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  navChevron: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.4)', marginLeft: 4, transform: [{ rotate: '90deg' }] },
  navChevronOpen: { transform: [{ rotate: '270deg' }] },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  datePillText: { fontFamily: 'SourceCodePro', fontSize: 11, color: C.ink },
  gearIcon: { fontSize: 18, color: 'rgba(255,255,255,0.45)' },

  // View tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    position: 'relative',
    alignItems: 'center',
  },
  tabLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabLabelActive: { color: C.ink },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: C.purpleLight,
    borderRadius: 1,
  },

  // Canvas (main body area)
  canvas: { flex: 1, position: 'relative', overflow: 'hidden' },

  // Body SVG wrapper
  bodyWrap: {
    position: 'absolute',
    top: '2.5%',
    left: 0,
    right: RAIL_W_INACTIVE,
    bottom: 0,
  },
  bodySvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Legend overlay
  legendPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(10,12,20,0.92)',
    overflow: 'hidden',
    zIndex: 5,
    minWidth: 140,
  },
  legendInner: { paddingVertical: 10, paddingHorizontal: 12 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendGlow: {
    position: 'absolute',
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  legendLabel: {
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 12,
    color: C.ink,
    flex: 1,
  },

  // Vertical time rail
  railWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'visible',
    zIndex: 3,
  },
  railTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  railDash: {
    position: 'absolute',
    left: 3,
    right: 3,
    height: 3,
    borderRadius: 1.5,
  },
  railThumb: {
    position: 'absolute',
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.aqua,
    shadowColor: C.aqua,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  railLabel: {
    position: 'absolute',
    right: RAIL_W_ACTIVE + 4,
    backgroundColor: 'rgba(10,12,20,0.9)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  railLabelText: { fontFamily: 'SourceCodePro', fontSize: 9, color: C.aqua },
  railBookend: {
    position: 'absolute',
    right: 2,
    fontFamily: 'SourceCodePro',
    fontSize: 8,
    color: 'rgba(255,255,255,0.3)',
  },

  // Timeline list
  timelineList: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    zIndex: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 12,
    paddingRight: 16,
  },
  timelineColorBar: { width: 3, alignSelf: 'stretch', marginRight: 12 },
  timelineRowContent: { flex: 1 },
  timelineRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timelineDateChip: { fontFamily: 'SourceCodePro', fontSize: 9, color: C.inkMuted },
  timelineSysTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  timelineSysText: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  timelineCondName: { fontFamily: 'MOMCAKE-Bold', fontSize: 16, color: C.ink },
  timelineMedName: { fontFamily: 'BarlowCondensed-Regular', fontSize: 11, color: C.inkMuted, marginTop: 2 },
  timelineChevron: { fontFamily: 'BarlowCondensed-Regular', fontSize: 18, color: C.inkDim },

  // Condition sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 10,
  },
  sheetHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sysDot: { width: 8, height: 8, borderRadius: 4 },
  sheetCondName: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 14, color: C.ink, flex: 1 },
  sheetCondSub: { fontFamily: 'BarlowCondensed-Regular', fontSize: 11, color: C.inkMuted },
  chatOpenBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chatOpenBtnText: { fontSize: 16 },
  sheetCloseBtn: { fontSize: 18, color: C.inkMuted, padding: 4 },

  sheetCondNameLarge: { fontFamily: 'MOMCAKE-Bold', fontSize: 26, color: C.ink, marginBottom: 4 },
  sheetCondSubEn: { fontFamily: 'BarlowCondensed-Regular', fontSize: 13, color: C.inkMuted, marginBottom: 10 },
  sheetDateRow: { marginBottom: 12 },
  sheetDateChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(31,195,164,0.12)',
  },
  sheetDateText: { fontFamily: 'SourceCodePro', fontSize: 12, color: C.aqua },
  sheetNote: { fontFamily: 'BarlowCondensed-Regular', fontSize: 16, color: C.ink, lineHeight: 22, marginBottom: 6 },
  sheetEvidence: { fontFamily: 'SourceCodePro', fontSize: 11, color: C.inkMuted, marginBottom: 16 },
  chatCta: {
    backgroundColor: C.purpleLight,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  chatCtaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#fff', letterSpacing: 0.3 },

  // Chat
  chatScroll: { flex: 1 },
  chatContent: { padding: 12, gap: 10 },
  chatEmpty: { fontFamily: 'BarlowCondensed-Regular', fontSize: 14, color: C.inkMuted, textAlign: 'center', marginTop: 20 },
  chatBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: C.purpleTint,
    borderRadius: 12,
    borderBottomRightRadius: 2,
  },
  chatBubbleAssist: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderBottomLeftRadius: 2,
  },
  chatBubbleText: { fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: C.ink, lineHeight: 20 },
  chatBubbleUserText: { color: '#fff' },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  chatInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surfaceHigh,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: C.purpleLight },
  sendBtnText: { color: C.ink, fontSize: 18, fontWeight: '700' },

  // Settings
  settingsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  settingsTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsSectionLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 10,
    color: C.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: C.surfaceHigh,
  },
  langPillActive: { backgroundColor: C.purpleLight, borderColor: C.purpleLight },
  langPillText: { fontFamily: 'BarlowCondensed-Regular', fontSize: 13, color: C.inkMuted },
  langPillTextActive: { color: '#fff', fontFamily: 'BarlowCondensed-SemiBold' },
  dobRow: { gap: 10, marginBottom: 20 },
  dobYearInput: {
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: 'SourceCodePro',
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.surfaceHigh,
    width: 80,
  },
  dobMonthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  monthChipActive: { backgroundColor: C.purpleLight, borderColor: C.purpleLight },
  monthChipText: { fontFamily: 'SourceCodePro', fontSize: 9, color: C.inkMuted },
  monthChipTextActive: { color: '#fff' },

  // Upload shortcuts (lower-left)
  uploadWrap: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    alignItems: 'center',
    zIndex: 4,
  },
  uploadBtns: { gap: 8, alignItems: 'center', marginBottom: 8 },
  uploadShortcut: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadShortcutIcon: { fontSize: 14 },
  qsWordmark: { opacity: 0.3 },

  // Backdrop
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 9,
  },
})
