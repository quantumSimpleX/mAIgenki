import { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import {
  Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, {
  Defs, LinearGradient, Rect, Stop,
} from 'react-native-svg'
import { Image } from 'expo-image'
import { useAppStore } from '@/store/useAppStore'
import { ALL_SYSTEMS, CONDITIONS, type SystemId } from '@/model/conditions'
import { useOptionalIndexedDb } from '@/lib/db/indexedDbProvider'
import { seedIndexedDbDemoData } from '@/lib/db/indexedDb'
import { processHealthRecord } from '@/lib/pipeline'
import { downloadPipelineDebugLog } from '@/lib/debug/pipelineDebug'
import { EnrichmentFailedError } from '@/lib/llm/enrich'

// The native animation driver is absent on web; using it there only warns.
const IS_WEB = Platform.OS === 'web'

function fontScaleForWidth(width: number): number {
  if (!IS_WEB) return 1
  if (width < 680) return 1
  if (width < 980) return 1.35
  return 1.75
}

function scaled(n: number, scale: number): number {
  return Math.round(n * scale)
}

const C = {
  bg: '#0A0E14',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  aqua: '#1FC3A4',
  pending: '#1E2535',
  procText: 'rgba(250,250,247,0.78)',
}

const PHASES = ['Reading records', 'Extracting diagnoses', 'Mapping anatomy', 'Building story']
const ANALYSIS_PROGRESS_REMAINING_FRACTION = 1 / 17
const ANALYSIS_PROGRESS_TICK_MS = 2_000
const RAMP_LOW = 0.25
const RAMP_HIGH = 0.85
const RAMP_UP_MS = 1250
const RAMP_HOLD_MS = 1000
const RAMP_DOWN_MS = 1250
const RAMP_STAGGER_MS = RAMP_UP_MS + RAMP_HOLD_MS
const ROW_OFFSET_VIEWPORT_RATIO = 0.17
const ASSET_BASE_SCALE = 0.92169
const PROGRESS_BAR_HEIGHT = 4
const ANCHOR_DOTS_GAP = 6
const DEMO_ANALYSIS_MIN_MS = 2600
const DEMO_DB_WAIT_MS = 15000

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function assetScaleForWidth(width: number): number {
  const t = clamp((width - 360) / (980 - 360), 0, 1)
  return 0.9 + t * 0.1
}

function progressInsetForWidth(width: number): number {
  if (!IS_WEB) return 64
  if (width < 680) return 28
  if (width < 980) return 56
  return 96
}

function progressGap(fontScale: number): number {
  return IS_WEB ? scaled(10, fontScale) : 12
}

function progressDotsHeight(fontScale: number): number {
  return scaled(8, fontScale) + ANCHOR_DOTS_GAP + scaled(11, fontScale)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function replaceBodymap(source?: 'auto' | 'demo', added?: number): void {
  const params = new URLSearchParams()
  if (source) params.set('source', source)
  if (added !== undefined) params.set('added', String(added))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  if (IS_WEB && typeof window !== 'undefined') {
    window.location.replace(`/bodymap${suffix}`)
    return
  }
  if (source) {
    router.replace({
      pathname: '/bodymap',
      params: added !== undefined ? { source, added: String(added) } : { source },
    })
  } else {
    router.replace('/bodymap')
  }
}

function Logo({ fontScale }: { fontScale: number }) {
  return (
    <View style={styles.logoRow}>
      <Text style={[styles.logoM, { fontSize: scaled(18, fontScale) }]}>m</Text>
      <Text style={[styles.logoAI, { fontSize: scaled(20, fontScale), lineHeight: scaled(20, fontScale) }]}>AI</Text>
      <Text style={[styles.logoGenki, { fontSize: scaled(18, fontScale) }]}> Genki</Text>
    </View>
  )
}

const INGEST_LAYERS: Record<SystemId, number> = {
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

const PREVIEW_SYSTEMS = ALL_SYSTEMS.filter((system) => system !== 'reproductive')

function randomNextLayerIndex(count: number, previousIndex: number): number {
  if (count <= 1) return 0
  if (previousIndex < 0) return Math.floor(Math.random() * count)

  const next = Math.floor(Math.random() * (count - 1))
  return next >= previousIndex ? next + 1 : next
}

function layerOpacityRamp(anim: Animated.Value): Animated.CompositeAnimation {
  return Animated.sequence([
    Animated.timing(anim, {
      toValue: RAMP_HIGH,
      duration: RAMP_UP_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: !IS_WEB,
    }),
    Animated.delay(RAMP_HOLD_MS),
    Animated.timing(anim, {
      toValue: RAMP_LOW,
      duration: RAMP_DOWN_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: !IS_WEB,
    }),
  ])
}

function runRandomOpacityRamps(opacityAnims: Animated.Value[]): () => void {
  let stopped = false
  let previousIndex = -1
  let nextTimer: ReturnType<typeof setTimeout> | null = null
  const activeAnimations: Animated.CompositeAnimation[] = []

  const queueNext = () => {
    if (stopped) return

    const index = randomNextLayerIndex(opacityAnims.length, previousIndex)
    previousIndex = index

    const animation = layerOpacityRamp(opacityAnims[index])
    activeAnimations.push(animation)
    animation.start(() => {
      const animationIndex = activeAnimations.indexOf(animation)
      if (animationIndex >= 0) activeAnimations.splice(animationIndex, 1)
    })
    nextTimer = setTimeout(queueNext, RAMP_STAGGER_MS)
  }

  queueNext()

  return () => {
    stopped = true
    if (nextTimer) clearTimeout(nextTimer)
    activeAnimations.forEach((animation) => animation.stop())
  }
}

function AnatomyLayerPreview({ onTopChange }: { onTopChange: (top: number) => void }) {
  const { width, height } = useWindowDimensions()
  const fontScale = fontScaleForWidth(width)
  const [opacityAnims] = useState(() => PREVIEW_SYSTEMS.map(() => new Animated.Value(RAMP_LOW)))
  const previewW = width
  const sidePad = width >= 680 ? Math.min(width * 0.08, IS_WEB ? 96 : 30) : 0
  const rowW = previewW - sidePad * 2
  const rowGroups = width >= 980
    ? [PREVIEW_SYSTEMS]
    : width >= 680
      ? [PREVIEW_SYSTEMS.slice(0, 5), PREVIEW_SYSTEMS.slice(5)]
      : [PREVIEW_SYSTEMS.slice(0, 3), PREVIEW_SYSTEMS.slice(3, 6), PREVIEW_SYSTEMS.slice(6)]
  const maxRowCount = Math.max(...rowGroups.map((row) => row.length))
  const bottomOffset = IS_WEB ? 18 : 10
  const topReserve = IS_WEB ? scaled(128, fontScale) : 92
  const headlineBottom = IS_WEB ? scaled(136, fontScale) : 102
  const rowOffset = rowGroups.length === 1 ? 0 : height * ROW_OFFSET_VIEWPORT_RATIO
  const bottomGap = progressGap(fontScale)
  const dotsHeight = progressDotsHeight(fontScale)
  const dotsTop = height - bottomOffset - PROGRESS_BAR_HEIGHT - bottomGap - dotsHeight
  const anchorRowIndex = rowGroups.length === 3 ? 1 : 0
  const anchorBottom = dotsTop - ANCHOR_DOTS_GAP
  const assetScale = ASSET_BASE_SCALE * assetScaleForWidth(width)
  const baseImageH = Math.max(IS_WEB ? 400 : 288, Math.min((height - topReserve - bottomOffset) * 1.25, IS_WEB ? 775 : 538)) * assetScale
  const anchoredMaxH = Math.max(1, anchorBottom - headlineBottom - anchorRowIndex * rowOffset)
  const imageH = rowGroups.length > 1 ? Math.min(baseImageH, anchoredMaxH) : baseImageH
  const previewH = imageH + (rowGroups.length - 1) * rowOffset
  const slotW = rowW / maxRowCount
  const imageW = Math.max(slotW * 1.75 * assetScale, imageH / 2.39)
  const previewTop = height - bottomOffset - previewH
  const layerTop = rowGroups.length === 1
    ? previewTop - 30
    : anchorBottom - imageH - anchorRowIndex * rowOffset

  useEffect(() => {
    opacityAnims.forEach((anim) => anim.setValue(RAMP_LOW))
    return runRandomOpacityRamps(opacityAnims)
  }, [opacityAnims])

  useEffect(() => {
    onTopChange(layerTop)
  }, [layerTop, onTopChange])

  return (
    <View pointerEvents="none" style={[styles.layerRows, { width: previewW, height: previewH, top: layerTop, paddingHorizontal: sidePad }]}>
      {rowGroups.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.layerRow, { top: rowIndex * rowOffset, height: imageH }]}>
          {row.map((system) => {
            const i = PREVIEW_SYSTEMS.indexOf(system)
            return (
              <Animated.View
                key={system}
                style={[
                  styles.layerTile,
                  {
                    width: slotW,
                    height: imageH,
                    opacity: opacityAnims[i],
                    zIndex: i,
                  },
                ]}
              >
                <Image source={INGEST_LAYERS[system]} style={[styles.layerImage, { width: imageW, height: imageH }]} contentFit="contain" />
              </Animated.View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

// Post-completion passive nudge: free-tier degradation is transient and never
// blocks the result — dismissible, and hidden again once dismissed or resolved.
export function DegradedBanner({ complete }: { complete: boolean }) {
  const llmStatus = useAppStore((s) => s.llmStatus)
  const [dismissed, setDismissed] = useState(false)
  if (!complete || llmStatus !== 'degraded' || dismissed) return null
  return (
    <View style={styles.degradedBanner}>
      <Text style={styles.degradedBannerText}>
        Free AI models are busy. Connect your own account for reliable access.
      </Text>
      <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={8} accessibilityLabel="Dismiss">
        <Text style={styles.degradedBannerClose}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

// Shown alongside the error surface only for rate-limit/quota failures — other
// failure kinds (e.g. network) get no upgrade nudge, per lmfPlan.md A1.
export function ConnectProviderCta() {
  const llmStatus = useAppStore((s) => s.llmStatus)
  const lastLlmFailureKind = useAppStore((s) => s.lastLlmFailureKind)
  const setOpenSettingsSection = useAppStore((s) => s.setOpenSettingsSection)
  const show = llmStatus === 'exhausted'
    && (lastLlmFailureKind === 'rate_limit' || lastLlmFailureKind === 'quota_billing')
  if (!show) return null
  return (
    <TouchableOpacity
      style={styles.connectBtn}
      onPress={() => {
        setOpenSettingsSection('provider')
        router.replace('/bodymap')
      }}
    >
      <Text style={styles.connectBtnText}>Connect provider</Text>
    </TouchableOpacity>
  )
}

function PhaseDots({ fontScale, phase }: { fontScale: number, phase: number }) {
  const dotSize = scaled(8, fontScale)
  const labelLineHeight = scaled(11, fontScale)
  return (
    <View style={[styles.dotsRow, { height: progressDotsHeight(fontScale) }]}>
      {PHASES.map((label, i) => {
        const color = i < phase ? C.aqua : i === phase ? C.purpleLight : C.pending
        return (
          <View key={label} style={styles.dotCol}>
            <View style={[styles.dot, { backgroundColor: color, width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
            <Text style={[styles.dotLabel, { color: i <= phase ? C.ink : C.inkMuted, fontSize: scaled(9, fontScale), lineHeight: labelLineHeight }]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

export default function AnalyzingScreen() {
  const { demo } = useLocalSearchParams<{ demo?: string }>()
  const routeDemo = demo === '1'
  const analyzeProgress = useAppStore((s) => s.analyzeProgress)
  const analyzePhase = useAppStore((s) => s.analyzePhase)
  const setAnalyzeProgress = useAppStore((s) => s.setAnalyzeProgress)
  const setAnalyzePhase = useAppStore((s) => s.setAnalyzePhase)
  const setScreen = useAppStore((s) => s.setScreen)
  const pendingUpload = useAppStore((s) => s.pendingUpload)
  const pendingDemo = useAppStore((s) => s.pendingDemo)
  const setActiveSystems = useAppStore((s) => s.setActiveSystems)
  const setCurrentYear = useAppStore((s) => s.setCurrentYear)
  const setConditionSource = useAppStore((s) => s.setConditionSource)
  const setPendingUpload = useAppStore((s) => s.setPendingUpload)
  const setPendingDemo = useAppStore((s) => s.setPendingDemo)
  const setLastUploadResult = useAppStore((s) => s.setLastUploadResult)
  const setPipelineError = useAppStore((s) => s.setPipelineError)
  const gender = useAppStore((s) => s.gender)
  const idb = useOptionalIndexedDb()
  const { width: viewportW } = useWindowDimensions()
  const fontScale = fontScaleForWidth(viewportW)
  const bottomGap = progressGap(fontScale)
  const trackW = Math.max(180, viewportW - progressInsetForWidth(viewportW))

  const [fadeIn] = useState(() => new Animated.Value(0))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [assetTop, setAssetTop] = useState(IS_WEB ? 180 : 120)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  // Intro animations (run once on mount).
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: !IS_WEB, easing: Easing.out(Easing.ease) }).start()
  }, [fadeIn])

  // Direct route path: no pending upload/demo, so show the analysis animation
  // briefly, then continue to the bodymap.
  useEffect(() => {
    if (pendingUpload || pendingDemo || routeDemo || startedRef.current) return
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
  }, [pendingUpload, pendingDemo, routeDemo, setAnalyzeProgress, setAnalyzePhase, setScreen])

  // Demo path: populate/repopulate sample rows through IndexedDB during
  // analysis, then continue to bodymap with all anatomical systems visible.
  useEffect(() => {
    if ((!pendingDemo && !routeDemo) || startedRef.current) return

    setPendingDemo(false)
    setConditionSource('demo')
    setActiveSystems([...ALL_SYSTEMS])
    setCurrentYear(2024)

    if (!idb) {
      let progress = 0
      const tick = setInterval(() => {
        progress = Math.min(0.88, progress + 0.01)
        setAnalyzeProgress(progress)
        setAnalyzePhase(Math.min(3, Math.floor(progress * 4)))
      }, 120)
      const timer = setTimeout(() => {
        if (startedRef.current || !mountedRef.current) return
        startedRef.current = true
        clearInterval(tick)
        setAnalyzeProgress(1)
        setAnalyzePhase(3)
        setLastUploadResult({
          recordId: 'demo',
          conditionCount: CONDITIONS.length,
          measurementCount: 0,
        })
        setPipelineError(null)
        setScreen('bodymap')
        setTimeout(() => replaceBodymap('demo', CONDITIONS.length), 400)
      }, DEMO_DB_WAIT_MS)
      return () => {
        clearInterval(tick)
        clearTimeout(timer)
      }
    }

    startedRef.current = true

    let progress = 0
    const tick = setInterval(() => {
      progress = Math.min(0.92, progress + 0.02)
      setAnalyzeProgress(progress)
      setAnalyzePhase(Math.min(3, Math.floor(progress * 4)))
    }, 80)

    void (async () => {
      try {
        await Promise.all([
          seedIndexedDbDemoData(idb),
          delay(DEMO_ANALYSIS_MIN_MS),
        ])
        clearInterval(tick)
        if (!mountedRef.current) return
        setAnalyzeProgress(1)
        setAnalyzePhase(3)
        setLastUploadResult({
          recordId: 'demo',
          conditionCount: CONDITIONS.length,
          measurementCount: 0,
        })
        setPipelineError(null)
        setScreen('bodymap')
        setTimeout(() => replaceBodymap('demo', CONDITIONS.length), 400)
      } catch (e) {
        clearInterval(tick)
        if (!mountedRef.current) return
        const msg = e instanceof Error ? e.message : 'Something went wrong while preparing demo data.'
        setPipelineError(msg)
        setErrorMsg(msg)
      }
    })()

    return () => clearInterval(tick)
  }, [
    pendingDemo, routeDemo, idb,
    setAnalyzeProgress, setAnalyzePhase, setScreen,
    setActiveSystems, setCurrentYear, setConditionSource,
    setPendingDemo, setLastUploadResult, setPipelineError,
  ])

  // Upload path: run extraction/enrichment/inference/persistence, then route to
  // bodymap when IndexedDB has the uploaded conditions.
  useEffect(() => {
    if (!pendingUpload || startedRef.current) return

    if (!idb) {
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

    // Each phase owns a progress interval. The bar approaches the interval's
    // end by the configured fraction of the remaining distance per tick, and only
    // advances to the next interval when the pipeline reports completion.
    let target = 0.4
    setAnalyzeProgress(0)
    const smooth = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(smooth)
        return
      }
      const cur = useAppStore.getState().analyzeProgress
      if (cur < target) {
        const remaining = target - cur
        const step = remaining * ANALYSIS_PROGRESS_REMAINING_FRACTION
        setAnalyzeProgress(Math.min(target, cur + step))
      }
    }, ANALYSIS_PROGRESS_TICK_MS)

    void (async () => {
      try {
        const result = await processHealthRecord({
          uri: upload.uri,
          idb,
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
        setConditionSource('auto')
        setPendingUpload(null)
        console.info('[health-pipeline] bodymap-transition', {
          recordId: result.recordId,
          conditionCount: result.conditionCount,
          measurementCount: result.measurementCount,
        })
        setPipelineError(null)
        setScreen('bodymap')
 void downloadPipelineDebugLog()
 setTimeout(() => replaceBodymap('auto', result.conditionCount), 400)
 } catch (e) {
 void downloadPipelineDebugLog()
        clearInterval(smooth)
        if (!mountedRef.current) return
        let msg: string
        if (e instanceof EnrichmentFailedError) {
          console.warn('[analyzing] enrichment failed —', e.failures.join('; '))
          console.error('[health-pipeline] failed', {
            errorType: e.name,
            failureCount: e.failures.length,
            failures: e.failures,
          })
          const cooldown = e.failures.some((failure) => failure.includes('on cooldown'))
          msg = cooldown
            ? 'The selected Gemini model is temporarily rate-limited. Wait briefly, choose another model, or enable free-model fallback in Settings.'
            : 'Could not analyze this record — check your connection or try again.'
        } else {
          console.error('[health-pipeline] failed', {
            errorType: e instanceof Error ? e.name : 'unknown',
            message: e instanceof Error ? e.message : String(e),
          })
          msg = e instanceof Error ? e.message : 'Something went wrong while analyzing this file.'
        }
        setPendingUpload(null)
        setPipelineError(msg)
        setErrorMsg(msg)
      }
    })()

    return () => clearInterval(smooth)
  }, [
    pendingUpload, idb, gender,
    setAnalyzeProgress, setAnalyzePhase, setScreen,
    setPendingUpload, setLastUploadResult, setConditionSource, setPipelineError,
  ])

  const pct = Math.round(analyzeProgress * 100)

  if (errorMsg) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.content}>
            <Logo fontScale={fontScale} />
            <Text style={[styles.headline, { fontSize: scaled(34, fontScale), lineHeight: scaled(32, fontScale) }]}>Couldn’t{'\n'}analyze</Text>
            <Text style={[styles.errorText, { fontSize: scaled(15, fontScale), lineHeight: scaled(21, fontScale) }]}>{errorMsg}</Text>
            <ConnectProviderCta />
            <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
              <Text style={[styles.backBtnText, { fontSize: scaled(16, fontScale) }]}>Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <DegradedBanner complete={analyzeProgress >= 1} />
        <Animated.View style={[styles.content, { opacity: fadeIn }]}>
          <View style={[styles.topBlock, { gap: IS_WEB ? scaled(14, fontScale) : 14, top: Math.max(IS_WEB ? 10 : 6, assetTop - (IS_WEB ? scaled(112, fontScale) : 78)) }]}>
            <Logo fontScale={fontScale} />
            <Text style={[styles.headline, { fontSize: scaled(34, fontScale), lineHeight: scaled(32, fontScale) }]}>Analyzing{'\n'}records…</Text>
          </View>

          <AnatomyLayerPreview onTopChange={setAssetTop} />

          <View style={[styles.bottomBlock, { gap: bottomGap }]}>
            <View style={styles.phaseBlock}>
              <Text style={[styles.phaseName, { fontSize: scaled(15, fontScale) }]}>{PHASES[analyzePhase]}</Text>
              <Text style={[styles.phaseSub, { fontSize: scaled(12, fontScale) }]}>{pct}% — processing on-device</Text>
            </View>

            <PhaseDots fontScale={fontScale} phase={analyzePhase} />

            {/* Gradient progress bar */}
            <View style={[styles.barTrack, { width: trackW }]}>
              <View style={[styles.barClip, { width: analyzeProgress * trackW }]}>
                <Svg width={trackW} height={PROGRESS_BAR_HEIGHT}>
                  <Defs>
                    <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={C.purpleLight} />
                      <Stop offset="1" stopColor={C.aqua} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={trackW} height={PROGRESS_BAR_HEIGHT} rx={2} fill="url(#barGrad)" />
                </Svg>
              </View>
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
  content: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 32, paddingTop: IS_WEB ? 18 : 10, paddingBottom: IS_WEB ? 18 : 10,
    position: 'relative', overflow: 'hidden',
  },
  topBlock: { position: 'absolute', alignItems: 'center', zIndex: 2 },
  bottomBlock: { position: 'absolute', bottom: IS_WEB ? 18 : 10, alignItems: 'center', zIndex: 2 },

  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoM: { fontFamily: 'BarlowCondensed-Bold', color: 'rgba(255,255,255,0.9)' },
  logoAI: { fontFamily: 'MOMCAKE-Bold', color: C.purpleLight },
  logoGenki: { fontFamily: 'BarlowCondensed-Bold', color: 'rgba(255,255,255,0.9)' },

  headline: { fontFamily: 'MOMCAKE-Bold', color: C.ink, textAlign: 'center', letterSpacing: 0 },
  layerRows: { position: 'absolute', zIndex: 0 },
  layerRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  layerTile: {
    alignItems: 'center', justifyContent: 'center',
  },
  layerImage: {},

  phaseBlock: { alignItems: 'center', gap: 3 },
  phaseName: { fontFamily: 'BarlowCondensed-SemiBold', color: C.ink, letterSpacing: 0.3 },
  phaseSub: { fontFamily: 'SourceCodePro', color: C.procText },

  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 8 },
  dotCol: { alignItems: 'center', gap: ANCHOR_DOTS_GAP, flex: 1 },
  dot: {},
  dotLabel: { fontFamily: 'BarlowCondensed-Regular', textAlign: 'center' },

  barTrack: { height: PROGRESS_BAR_HEIGHT, backgroundColor: C.pending, borderRadius: 2, overflow: 'hidden' },
  barClip: { height: PROGRESS_BAR_HEIGHT, overflow: 'hidden' },

  errorText: {
    fontFamily: 'BarlowCondensed-Regular', color: C.ink,
    textAlign: 'center', opacity: 0.85, paddingHorizontal: 8,
  },
  backBtn: {
    borderWidth: 1, borderColor: C.purpleLight, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  backBtnText: { fontFamily: 'BarlowCondensed-Bold', color: C.purpleLight, letterSpacing: 0.5 },

  degradedBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.pending, paddingVertical: 10, paddingHorizontal: 16,
  },
  degradedBannerText: {
    flex: 1, fontFamily: 'BarlowCondensed-Regular', color: C.ink, fontSize: 13,
  },
  degradedBannerClose: { color: C.inkMuted, fontSize: 16 },

  connectBtn: {
    borderWidth: 1, borderColor: C.aqua, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32, marginTop: 8,
  },
  connectBtnText: { fontFamily: 'BarlowCondensed-Bold', color: C.aqua, letterSpacing: 0.5 },
})
