import { useCallback, useRef, useState } from 'react'
import {
  Animated, Dimensions, Easing, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useAppStore } from '@/store/useAppStore'
import {
  ALL_SYSTEMS, CONDITIONS, DesignCondition, SystemId,
  SYSTEM_META, SupportedLang, getLocalName,
} from '@/model/conditions'

const { width: SW, height: SH } = Dimensions.get('window')

const C = {
  bg: '#0A0E14',
  surface: '#111720',
  surfaceHigh: '#1A2333',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  inkDim: '#3D4E65',
  border: '#1E2A3A',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  purpleTint: 'rgba(112, 66, 214, 0.15)',
}

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const SUPPORTED_LANGS: { code: SupportedLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
]

const K = 2.5
const MIN_YEAR = 2013
const MAX_YEAR = 2024

function toLogX(yearFrac: number, railWidth: number): number {
  const t = Math.max(0, Math.min(1, (yearFrac - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)))
  const pos = (Math.exp(K * t) - 1) / (Math.exp(K) - 1)
  return pos * railWidth
}

// ─── Nav Bar ────────────────────────────────────────────────────────────────

function NavBar() {
  const {
    currentYear, timeDisplayMode, birthYear, birthMonth,
    toggleTimeDisplayMode, toggleSettings, setScreen,
    preferredLanguage,
  } = useAppStore()

  function fmtDatePill() {
    if (timeDisplayMode === 'date') return String(Math.floor(currentYear))
    const age = Math.floor(currentYear - birthYear)
    return `age ${age}`
  }

  return (
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => { setScreen('upload'); router.replace('/') }} hitSlop={12}>
        <View style={styles.logoRow}>
          <Text style={styles.logoM}>m</Text>
          <Text style={styles.logoAI}>AI</Text>
          <Text style={styles.logoGenki}> Genki</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.navRight}>
        <TouchableOpacity style={styles.datePill} onPress={toggleTimeDisplayMode}>
          <Text style={styles.datePillText}>{fmtDatePill()}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSettings} hitSlop={12} style={styles.gearBtn}>
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Body SVG ───────────────────────────────────────────────────────────────

function BodySvg({
  activeSystems,
  conditions,
  onConditionPress,
  currentYear,
  condDateOverrides,
}: {
  activeSystems: SystemId[]
  conditions: DesignCondition[]
  onConditionPress: (c: DesignCondition) => void
  currentYear: number
  condDateOverrides: Record<string, string>
}) {
  const W = 230
  const H = 480

  const visibleConds = conditions.filter((c) => {
    if (!activeSystems.includes(c.system)) return false
    const override = condDateOverrides[c.id]
    const frac = override ? parseFloat(override) : c.yearFrac
    return frac <= currentYear
  })

  return (
    <Svg width={W} height={H} viewBox="0 0 230 480">
      {/* Base silhouette */}
      {/* Head */}
      <Ellipse cx={115} cy={42} rx={34} ry={38} stroke="#1E2A3A" strokeWidth={1.5} fill="transparent" />
      {/* Neck */}
      <Path d="M100 78 L100 100 M130 78 L130 100" stroke="#1E2A3A" strokeWidth={1.5} />
      {/* Torso */}
      <Path
        d="M68 100 Q50 116 47 165 L42 285 Q42 310 68 316 L68 390 Q68 410 84 410 L146 410 Q162 410 162 390 L162 316 Q188 310 188 285 L183 165 Q180 116 162 100 Z"
        stroke="#1E2A3A" strokeWidth={1.5} fill="rgba(30,42,58,0.4)"
      />
      {/* Arms */}
      <Path d="M68 106 Q38 128 28 204 Q24 224 32 238 Q38 248 50 242 Q58 232 60 210 L64 150" stroke="#1E2A3A" strokeWidth={1.5} fill="transparent" />
      <Path d="M162 106 Q192 128 202 204 Q206 224 198 238 Q192 248 180 242 Q172 232 170 210 L166 150" stroke="#1E2A3A" strokeWidth={1.5} fill="transparent" />
      {/* Legs */}
      <Path d="M84 410 L76 510 Q74 534 88 534 Q102 534 104 510 L108 424" stroke="#1E2A3A" strokeWidth={1.5} fill="transparent" />
      <Path d="M146 410 L154 510 Q156 534 142 534 Q128 534 126 510 L122 424" stroke="#1E2A3A" strokeWidth={1.5} fill="transparent" />

      {/* Organ system highlights — visible when system is active */}
      {activeSystems.includes('cardio') && (
        <Ellipse cx={115} cy={175} rx={18} ry={20} fill={SYSTEM_META.cardio.color} opacity={0.18} />
      )}
      {activeSystems.includes('pulm') && (
        <>
          <Ellipse cx={97} cy={170} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
          <Ellipse cx={133} cy={170} rx={13} ry={18} fill={SYSTEM_META.pulm.color} opacity={0.15} />
        </>
      )}
      {activeSystems.includes('gi') && (
        <Ellipse cx={115} cy={240} rx={22} ry={30} fill={SYSTEM_META.gi.color} opacity={0.15} />
      )}
      {activeSystems.includes('renal') && (
        <>
          <Ellipse cx={95} cy={215} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
          <Ellipse cx={135} cy={215} rx={9} ry={13} fill={SYSTEM_META.renal.color} opacity={0.2} />
        </>
      )}
      {activeSystems.includes('endo') && (
        <Ellipse cx={115} cy={130} rx={10} ry={7} fill={SYSTEM_META.endo.color} opacity={0.25} />
      )}
      {activeSystems.includes('neuro') && (
        <Ellipse cx={115} cy={42} rx={28} ry={32} fill={SYSTEM_META.neuro.color} opacity={0.12} />
      )}
      {activeSystems.includes('repro') && (
        <Ellipse cx={115} cy={305} rx={18} ry={14} fill={SYSTEM_META.repro.color} opacity={0.2} />
      )}

      {/* Condition dots */}
      {visibleConds.map((c) => (
        <Circle
          key={c.id}
          cx={c.cx}
          cy={c.cy}
          r={6}
          fill={SYSTEM_META[c.system].color}
          stroke="#0A0E14"
          strokeWidth={1.5}
          onPress={() => onConditionPress(c)}
        />
      ))}
    </Svg>
  )
}

// ─── Legend Panel ────────────────────────────────────────────────────────────

function LegendPanel() {
  const { activeSystems, toggleSystem, legendOpen, toggleLegend } = useAppStore()

  if (!legendOpen) {
    return (
      <TouchableOpacity style={styles.legendCollapsed} onPress={toggleLegend}>
        <Text style={styles.legendCollapseIcon}>☰</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.legendPanel}>
      <TouchableOpacity style={styles.legendHeader} onPress={toggleLegend}>
        <Text style={styles.legendTitle}>Systems</Text>
        <Text style={styles.legendCollapseIcon}>✕</Text>
      </TouchableOpacity>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {ALL_SYSTEMS.map((id) => {
          const active = activeSystems.includes(id)
          const meta = SYSTEM_META[id]
          return (
            <TouchableOpacity
              key={id}
              style={[styles.legendRow, !active && styles.legendRowInactive]}
              onPress={() => toggleSystem(id)}
            >
              <View style={[styles.legendDot, { backgroundColor: meta.color, opacity: active ? 1 : 0.3 }]} />
              <Text style={[styles.legendLabel, !active && { opacity: 0.4 }]}>{meta.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ─── Time Rail ───────────────────────────────────────────────────────────────

function TimeRail({ conditions }: { conditions: DesignCondition[] }) {
  const { currentYear, setCurrentYear, activeSystems, condDateOverrides, birthYear, timeDisplayMode } = useAppStore()
  const railRef = useRef<View>(null)
  const [railW, setRailW] = useState(SW - 40)

  function fmtTick(year: number) {
    if (timeDisplayMode === 'age') return `${year - birthYear}`
    return `'${String(year).slice(2)}`
  }

  const ticks = [2013, 2015, 2017, 2019, 2021, 2023, 2024]
  const cursorX = toLogX(currentYear, railW)

  return (
    <View
      style={styles.railWrap}
      onLayout={(e) => setRailW(e.nativeEvent.layout.width)}
    >
      {/* Condition segments */}
      {conditions
        .filter((c) => activeSystems.includes(c.system))
        .map((c) => {
          const override = condDateOverrides[c.id]
          const frac = override ? parseFloat(override) : c.yearFrac
          const x = toLogX(frac, railW)
          return (
            <View
              key={c.id}
              style={[
                styles.railSegment,
                {
                  left: x - 2,
                  backgroundColor: SYSTEM_META[c.system].color,
                },
              ]}
            />
          )
        })}

      {/* Year ticks */}
      {ticks.map((yr) => {
        const x = toLogX(yr, railW)
        return (
          <View key={yr} style={[styles.railTick, { left: x }]}>
            <View style={styles.railTickLine} />
            <Text style={styles.railTickLabel}>{fmtTick(yr)}</Text>
          </View>
        )
      })}

      {/* Cursor */}
      <View style={[styles.railCursor, { left: cursorX - 1 }]} />

      {/* Base line */}
      <View style={styles.railLine} />
    </View>
  )
}

// ─── Condition Sheet ──────────────────────────────────────────────────────────

const DISCLAIMER = 'Educational only. Not medical advice. Never a substitute for professional clinical judgment.'

function ConditionSheet() {
  const insets = useSafeAreaInsets()
  const {
    selectedCondition, sheetOpen, closeSheet,
    chatOpen, setChatOpen, chatMessages, addChatMessage,
    chatInputVal, setChatInputVal, chatLoading, setChatLoading, clearChat,
    preferredLanguage,
  } = useAppStore()

  const sheetAnim = useRef(new Animated.Value(0)).current
  const [disclaimerShown, setDisclaimerShown] = useState(false)

  const prevOpen = useRef(false)
  if (prevOpen.current !== sheetOpen) {
    prevOpen.current = sheetOpen
    Animated.timing(sheetAnim, {
      toValue: sheetOpen ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }

  const sheetH = chatOpen ? SH * 0.8 : 340
  const translateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetH + 40, 0],
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
      addChatMessage({ role: 'assistant', content: 'Unable to connect. Please check your network and API key in Settings.' })
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
        { height: sheetH, paddingBottom: insets.bottom + 12 },
        { transform: [{ translateY }] },
      ]}
    >
      {/* Drag handle */}
      <View style={styles.sheetHandle} />

      {/* Condition header */}
      <View style={styles.sheetHeader}>
        <View style={[styles.systemDot, { backgroundColor: meta.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.condLocalName}>{localName}</Text>
          {preferredLanguage !== 'en' && (
            <Text style={styles.condSubname}>{selectedCondition.label} · {selectedCondition.medName}</Text>
          )}
          {preferredLanguage === 'en' && (
            <Text style={styles.condSubname}>{selectedCondition.medName}</Text>
          )}
        </View>
        {chatOpen ? (
          <TouchableOpacity onPress={() => setChatOpen(false)} hitSlop={10}>
            <Text style={styles.collapseBtn}>↓</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={closeSheet} hitSlop={10}>
            <Text style={styles.closeBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!chatOpen && (
        <>
          <View style={styles.sheetMeta}>
            <Text style={styles.sheetMetaLabel}>{selectedCondition.date}</Text>
            <View style={[styles.sheetMetaTag, { borderColor: meta.color + '60' }]}>
              <Text style={[styles.sheetMetaTagText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={styles.sheetNote}>{selectedCondition.note}</Text>
          <Text style={styles.sheetEvidence}>{selectedCondition.evidence}</Text>

          {/* Chat button */}
          <TouchableOpacity style={styles.chatOpenBtn} onPress={openChat}>
            <Text style={styles.chatOpenBtnText}>💬 Ask about this condition</Text>
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
                <Text style={[
                  styles.chatBubbleText,
                  msg.role === 'user' && { color: '#fff' },
                ]}>
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
              style={[styles.sendBtn, chatInputVal.trim() && styles.sendBtnActive]}
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
      duration: 260,
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
      style={[
        styles.settingsSheet,
        { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
      ]}
      pointerEvents={settingsOpen ? 'auto' : 'none'}
    >
      <View style={styles.sheetHandle} />
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <TouchableOpacity onPress={toggleSettings} hitSlop={12}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Language */}
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

      {/* Date of birth */}
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
              <Text style={[styles.monthChipText, birthMonth === mo && styles.monthChipTextActive]}>
                {mo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.settingsTip}>
        Tap the year label in the nav to toggle date / age display.
      </Text>
    </Animated.View>
  )
}

// ─── Upload Shortcuts Panel ───────────────────────────────────────────────────

function UploadPanel() {
  const { uploadPanelOpen, setUploadPanelOpen, startAnalyze } = useAppStore()

  return (
    <View style={styles.uploadPanelWrap}>
      <TouchableOpacity
        style={styles.uploadToggleBtn}
        onPress={() => setUploadPanelOpen(!uploadPanelOpen)}
      >
        <Text style={styles.uploadToggleIcon}>{uploadPanelOpen ? '✕' : '+'}</Text>
      </TouchableOpacity>
      {uploadPanelOpen && (
        <View style={styles.uploadPanelBtns}>
          <TouchableOpacity
            style={styles.uploadShortcutBtn}
            onPress={() => { router.replace('/') }}
          >
            <Text style={styles.uploadShortcutText}>📄 PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.uploadShortcutBtn}
            onPress={() => { router.replace('/') }}
          >
            <Text style={styles.uploadShortcutText}>🖼 Image</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ─── Root Screen ─────────────────────────────────────────────────────────────

export default function BodyMapScreen() {
  const insets = useSafeAreaInsets()
  const {
    activeSystems, selectCondition,
    currentYear, sheetOpen, settingsOpen, condDateOverrides,
  } = useAppStore()

  const handleConditionPress = useCallback((c: DesignCondition) => {
    selectCondition(c)
  }, [selectCondition])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <NavBar />

        <View style={styles.mapArea}>
          {/* Legend */}
          <LegendPanel />

          {/* Body canvas */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <BodySvg
              activeSystems={activeSystems}
              conditions={CONDITIONS}
              onConditionPress={handleConditionPress}
              currentYear={currentYear}
              condDateOverrides={condDateOverrides}
            />
          </ScrollView>
        </View>

        {/* Time rail */}
        <TimeRail conditions={CONDITIONS} />
      </SafeAreaView>

      {/* Bottom panel area */}
      <View style={[styles.bottomPanels, { paddingBottom: insets.bottom }]}>
        <UploadPanel />
      </View>

      {/* Condition detail sheet */}
      {sheetOpen && <ConditionSheet />}

      {/* Settings sheet */}
      {settingsOpen && <SettingsSheet />}

      {/* Backdrop for sheets */}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoM: { fontFamily: 'MOMCAKE-Thin', fontSize: 18, color: C.ink },
  logoAI: { fontFamily: 'MOMCAKE-Bold', fontSize: 18, color: '#8A60EB' },
  logoGenki: { fontFamily: 'MOMCAKE-Thin', fontSize: 18, color: C.ink },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHigh,
  },
  datePillText: { fontSize: 12, color: C.ink, fontWeight: '600' },
  gearBtn: { padding: 4 },
  gearIcon: { fontSize: 18, color: C.inkMuted },
  mapArea: {
    flex: 1,
    flexDirection: 'row',
  },
  bodyScroll: { flex: 1 },
  bodyScrollContent: {
    alignItems: 'center',
    paddingVertical: 16,
    minHeight: '100%',
  },

  // Legend
  legendPanel: {
    width: 120,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  legendCollapsed: {
    width: 32,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    alignItems: 'center',
    paddingTop: 16,
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendTitle: { fontSize: 10, fontWeight: '700', color: C.ink, letterSpacing: 1, textTransform: 'uppercase' },
  legendCollapseIcon: { fontSize: 14, color: C.inkMuted },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
  },
  legendRowInactive: { opacity: 0.5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: C.ink, flex: 1 },

  // Time rail
  railWrap: {
    height: 44,
    marginHorizontal: 20,
    marginBottom: 8,
    position: 'relative',
  },
  railLine: {
    position: 'absolute',
    left: 0, right: 0,
    top: 14,
    height: 1,
    backgroundColor: C.border,
  },
  railSegment: {
    position: 'absolute',
    top: 11,
    width: 4,
    height: 6,
    borderRadius: 2,
  },
  railTick: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    transform: [{ translateX: -8 }],
  },
  railTickLine: {
    width: 1,
    height: 8,
    backgroundColor: C.inkDim,
    marginTop: 10,
    marginBottom: 3,
  },
  railTickLabel: { fontSize: 9, color: C.inkMuted },
  railCursor: {
    position: 'absolute',
    top: 6,
    width: 2,
    height: 22,
    backgroundColor: C.purpleLight,
    borderRadius: 1,
  },

  // Bottom panels
  bottomPanels: {
    position: 'absolute',
    bottom: 64,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  uploadPanelWrap: { alignItems: 'flex-start', gap: 8 },
  uploadToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadToggleIcon: { fontSize: 18, color: C.ink },
  uploadPanelBtns: { flexDirection: 'row', gap: 8 },
  uploadShortcutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
  },
  uploadShortcutText: { fontSize: 13, color: C.ink, fontWeight: '500' },

  // Condition sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.inkDim,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  systemDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  condLocalName: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 22,
    color: C.ink,
    lineHeight: 26,
  },
  condSubname: {
    fontSize: 12,
    color: C.inkMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  collapseBtn: { fontSize: 18, color: C.inkMuted, padding: 4 },
  closeBtn: { fontSize: 16, color: C.inkMuted, padding: 4 },
  sheetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sheetMetaLabel: { fontSize: 12, color: C.inkMuted },
  sheetMetaTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  sheetMetaTagText: { fontSize: 11, fontWeight: '600' },
  sheetNote: {
    fontSize: 14,
    color: C.ink,
    lineHeight: 20,
    marginBottom: 6,
  },
  sheetEvidence: {
    fontSize: 12,
    color: C.inkMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  chatOpenBtn: {
    borderWidth: 1,
    borderColor: C.purple + '80',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.purpleTint,
  },
  chatOpenBtnText: { fontSize: 14, color: C.purpleLight, fontWeight: '500' },

  // Chat
  chatScroll: { flex: 1, marginTop: 8 },
  chatContent: { paddingBottom: 12, gap: 8 },
  chatEmpty: { fontSize: 14, color: C.inkMuted, textAlign: 'center', marginTop: 24 },
  chatBubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: C.purple,
    borderBottomRightRadius: 3,
  },
  chatBubbleAssist: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomLeftRadius: 3,
  },
  chatBubbleText: { fontSize: 14, color: C.ink, lineHeight: 20 },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: C.surfaceHigh,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    color: C.ink,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: C.purple, borderColor: C.purple },
  sendBtnText: { fontSize: 16, color: C.ink, fontWeight: '700' },

  // Settings
  settingsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  settingsTitle: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 20,
    color: C.ink,
  },
  settingsSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHigh,
  },
  langPillActive: { borderColor: C.purple, backgroundColor: C.purpleTint },
  langPillText: { fontSize: 13, color: C.inkMuted, fontWeight: '500' },
  langPillTextActive: { color: C.purpleLight },
  dobRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 16 },
  dobYearInput: {
    width: 72,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHigh,
    color: C.ink,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  dobMonthWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceHigh,
  },
  monthChipActive: { borderColor: C.purple, backgroundColor: C.purpleTint },
  monthChipText: { fontSize: 10, color: C.inkMuted, fontWeight: '600' },
  monthChipTextActive: { color: C.purpleLight },
  settingsTip: {
    fontSize: 12,
    color: C.inkDim,
    lineHeight: 17,
    marginTop: 4,
  },

  // Backdrop
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 8,
  },
})
