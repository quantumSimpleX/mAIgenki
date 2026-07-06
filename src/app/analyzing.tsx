import { useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import {
  Animated, Dimensions, Easing, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, {
  Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg'
import { useAppStore } from '@/store/useAppStore'
import { useOptionalDatabase } from '@/lib/db/provider'
import { getSetting } from '@/lib/db/queries'
import { processHealthRecord } from '@/lib/pipeline'

const { width: SW } = Dimensions.get('window')
const TRACK_W = SW - 64
// The native animation driver is absent on web; using it there only warns.
const IS_WEB = Platform.OS === 'web'

const C = {
  bg: '#0A0E14',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  aqua: '#1FC3A4',
  pending: '#1E2535',
  procText: '#3A434F',
}

const PHASES = ['Reading records', 'Extracting diagnoses', 'Mapping anatomy', 'Building story']

const DOT_POS: [number, number][] = [
  [90, 55], [62, 92], [118, 92], [90, 115], [90, 155], [90, 230], [90, 270],
]

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const TORSO_DASH = 1300

function Logo() {
  return (
    <View style={styles.logoRow}>
      <Text style={styles.logoM}>m</Text>
      <Text style={styles.logoAI}>AI</Text>
      <Text style={styles.logoGenki}> Genki</Text>
    </View>
  )
}

function BodySilhouette({ reveal }: { reveal: Animated.Value }) {
  const dashOffset = reveal.interpolate({ inputRange: [0, 1], outputRange: [TORSO_DASH, 0] })
  return (
    <Svg width={180} height={340} viewBox="0 0 180 340" fill="none">
      <Ellipse cx={90} cy={32} rx={26} ry={30} stroke="#2A3040" strokeWidth={1.5} />
      <Path d="M79 60 L79 78 M101 60 L101 78" stroke="#2A3040" strokeWidth={1.5} />
      <AnimatedPath
        d="M55 78 Q42 90 40 130 L36 210 Q36 230 55 234 L55 280 Q55 295 68 295 L112 295 Q125 295 125 280 L125 234 Q144 230 144 210 L140 130 Q138 90 125 78 Z"
        stroke={C.purpleLight} strokeWidth={1.5} fill="transparent"
        strokeDasharray={TORSO_DASH} strokeDashoffset={dashOffset}
      />
      <Path d="M55 82 Q32 100 24 155 Q22 170 26 180 Q30 188 38 184 Q44 178 46 160 L52 118" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      <Path d="M125 82 Q148 100 156 155 Q158 170 154 180 Q150 188 142 184 Q136 178 134 160 L128 118" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      <Path d="M68 295 L62 380 Q60 400 70 400 Q80 400 82 380 L84 310" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      <Path d="M112 295 L118 380 Q120 400 110 400 Q100 400 98 380 L96 310" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
    </Svg>
  )
}

function BlinkingDots() {
  const [anims] = useState(() => DOT_POS.map(() => new Animated.Value(0.2)))

  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: !IS_WEB }),
          Animated.timing(v, { toValue: 0.2, duration: 600, useNativeDriver: !IS_WEB }),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [])

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={180} height={340} viewBox="0 0 180 340">
        {DOT_POS.map(([cx, cy], i) => (
          <AnimatedCircle key={i} cx={cx} cy={cy} r={4.5} fill={C.purpleLight} opacity={anims[i]} />
        ))}
      </Svg>
    </View>
  )
}

function PhaseDots({ phase }: { phase: number }) {
  return (
    <View style={styles.dotsRow}>
      {PHASES.map((label, i) => {
        const color = i < phase ? C.aqua : i === phase ? C.purpleLight : C.pending
        return (
          <View key={label} style={styles.dotCol}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.dotLabel, { color: i <= phase ? C.ink : C.inkMuted }]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

export default function AnalyzingScreen() {
  const analyzeProgress = useAppStore((s) => s.analyzeProgress)
  const analyzePhase = useAppStore((s) => s.analyzePhase)
  const setAnalyzeProgress = useAppStore((s) => s.setAnalyzeProgress)
  const setAnalyzePhase = useAppStore((s) => s.setAnalyzePhase)
  const setScreen = useAppStore((s) => s.setScreen)
  const pendingUpload = useAppStore((s) => s.pendingUpload)
  const setPendingUpload = useAppStore((s) => s.setPendingUpload)
  const setLastUploadResult = useAppStore((s) => s.setLastUploadResult)
  const setPipelineError = useAppStore((s) => s.setPipelineError)
  const gender = useAppStore((s) => s.gender)
  const db = useOptionalDatabase()

  const [reveal] = useState(() => new Animated.Value(0))
  const [fadeIn] = useState(() => new Animated.Value(0))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Ensures the pipeline / demo animation runs exactly once, guarding against
  // React strict/dev double-mounts and effect re-runs as `db` resolves.
  const startedRef = useRef(false)
  // True only until the screen actually unmounts. Distinguishes a real unmount
  // (browser Back) from a dependency-change effect re-run — the latter fires the
  // effect cleanup too, but must NOT cancel an in-flight, still-mounted pipeline.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Intro animations (run once on mount).
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: !IS_WEB, easing: Easing.out(Easing.ease) }).start()
    Animated.timing(reveal, { toValue: 1, duration: 1600, useNativeDriver: !IS_WEB, easing: Easing.inOut(Easing.ease) }).start()
  }, [fadeIn, reveal])

  // Demo / direct-nav path: no pending upload → the original timed animation.
  useEffect(() => {
    if (pendingUpload || startedRef.current) return
    startedRef.current = true
    let progress = 0
    const tick = setInterval(() => {
      progress = Math.min(1, progress + 0.012)
      setAnalyzeProgress(progress)
      setAnalyzePhase(Math.min(3, Math.floor(progress * 4)))
      if (progress >= 1) {
        clearInterval(tick)
        setScreen('bodymap')
        setTimeout(() => router.replace('/bodymap'), 400)
      }
    }, 80)
    return () => clearInterval(tick)
  }, [pendingUpload, setAnalyzeProgress, setAnalyzePhase, setScreen])

  // Real-upload path: drive phase/progress from the pipeline's onProgress. The
  // bar eases smoothly toward each reported target. Waits for `db` to resolve.
  useEffect(() => {
    if (!pendingUpload || startedRef.current) return
    // Post-await work is guarded by mountedRef (true unmount), NOT by this
    // effect's cleanup — setPendingUpload(null) below re-runs the effect and
    // fires cleanup, but the pipeline is still running on a mounted screen.
    if (!db) {
      // Give the async DB provider a moment to resolve before declaring failure.
      const timer = setTimeout(() => {
        if (startedRef.current || !mountedRef.current) return
        startedRef.current = true
        setPendingUpload(null)
        const msg = 'Storage unavailable — uploads cannot be processed on this device.'
        setPipelineError(msg)
        setErrorMsg(msg)
      }, 5000)
      return () => clearTimeout(timer)
    }

    startedRef.current = true
    const upload = pendingUpload
    setPendingUpload(null)

    let target = 0.05
    const smooth = setInterval(() => {
      // Self-stop on true unmount so a dep-change re-run doesn't need to clear it.
      if (!mountedRef.current) { clearInterval(smooth); return }
      const cur = useAppStore.getState().analyzeProgress
      if (cur < target) setAnalyzeProgress(Math.min(target, cur + 0.02))
    }, 60)

    void (async () => {
      try {
        const apiKey = (await getSetting(db, 'openrouter_api_key')) ?? ''
        const result = await processHealthRecord({
          uri: upload.uri,
          db,
          apiKey,
          kind: upload.kind,
          sex: gender,
          onProgress: (phase, progress) => {
            if (!mountedRef.current) return
            setAnalyzePhase(phase)
            target = progress
          },
        })
        clearInterval(smooth)
        if (!mountedRef.current) return
        setAnalyzeProgress(1)
        setAnalyzePhase(3)
        setLastUploadResult(result)
        setPipelineError(null)
        setScreen('bodymap')
        setTimeout(() => router.replace('/bodymap'), 400)
      } catch (e) {
        clearInterval(smooth)
        if (!mountedRef.current) return
        const msg = e instanceof Error ? e.message : 'Something went wrong while analyzing this file.'
        setPipelineError(msg)
        setErrorMsg(msg)
      }
    })()

    return () => clearInterval(smooth)
  }, [
    pendingUpload, db, gender,
    setAnalyzeProgress, setAnalyzePhase, setScreen,
    setPendingUpload, setLastUploadResult, setPipelineError,
  ])

  const pct = Math.round(analyzeProgress * 100)

  if (errorMsg) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.content}>
            <Logo />
            <Text style={styles.headline}>Couldn’t{'\n'}analyze</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.content, { opacity: fadeIn }]}>
          <Logo />
          <Text style={styles.headline}>Analyzing{'\n'}records…</Text>

          <View style={styles.bodyWrap}>
            <BodySilhouette reveal={reveal} />
            <BlinkingDots />
          </View>

          <View style={styles.phaseBlock}>
            <Text style={styles.phaseName}>{PHASES[analyzePhase]}</Text>
            <Text style={styles.phaseSub}>{pct}% — processing on-device</Text>
          </View>

          <PhaseDots phase={analyzePhase} />

          {/* Gradient progress bar */}
          <View style={styles.barTrack}>
            <View style={[styles.barClip, { width: analyzeProgress * TRACK_W }]}>
              <Svg width={TRACK_W} height={4}>
                <Defs>
                  <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={C.purpleLight} />
                    <Stop offset="1" stopColor={C.aqua} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={TRACK_W} height={4} rx={2} fill="url(#barGrad)" />
              </Svg>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 22 },

  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoM: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },
  logoAI: { fontFamily: 'MOMCAKE-Bold', fontSize: 20, color: C.purpleLight, lineHeight: 20 },
  logoGenki: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: 'rgba(255,255,255,0.9)' },

  headline: { fontFamily: 'MOMCAKE-Bold', fontSize: 34, color: C.ink, textAlign: 'center', lineHeight: 32, letterSpacing: -1 },
  bodyWrap: { width: 180, height: 340, position: 'relative', overflow: 'hidden' },

  phaseBlock: { alignItems: 'center', gap: 3 },
  phaseName: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 15, color: C.ink, letterSpacing: 0.3 },
  phaseSub: { fontFamily: 'SourceCodePro', fontSize: 12, color: C.procText },

  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 8 },
  dotCol: { alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLabel: { fontFamily: 'BarlowCondensed-Regular', fontSize: 9, textAlign: 'center' },

  barTrack: { width: TRACK_W, height: 4, backgroundColor: C.pending, borderRadius: 2, overflow: 'hidden' },
  barClip: { height: 4, overflow: 'hidden' },

  errorText: {
    fontFamily: 'BarlowCondensed-Regular', fontSize: 15, color: C.ink,
    textAlign: 'center', lineHeight: 21, opacity: 0.85, paddingHorizontal: 8,
  },
  backBtn: {
    borderWidth: 1, borderColor: C.purpleLight, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  backBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: C.purpleLight, letterSpacing: 0.5 },
})
