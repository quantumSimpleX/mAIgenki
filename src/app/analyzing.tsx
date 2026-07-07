import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import {
  Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, {
  Defs, LinearGradient, Rect, Stop,
} from 'react-native-svg'
import { Image } from 'expo-image'
import { useAppStore } from '@/store/useAppStore'
import { ALL_SYSTEMS, type SystemId } from '@/model/conditions'

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
const RAMP_LOW = 0.25
const RAMP_HIGH = 0.85
const RAMP_UP_MS = 1250
const RAMP_HOLD_MS = 1000
const RAMP_DOWN_MS = 1250
const RAMP_STAGGER_MS = RAMP_UP_MS + RAMP_HOLD_MS
const ROW_OFFSET_VIEWPORT_RATIO = 0.17
const ASSET_BASE_SCALE = 0.92169

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
  const assetScale = ASSET_BASE_SCALE * assetScaleForWidth(width)
  const baseImageH = Math.max(IS_WEB ? 400 : 288, Math.min((height - topReserve - bottomOffset) * 1.25, IS_WEB ? 775 : 538)) * assetScale
  const twoRowMaxH = Math.max(1, height - bottomOffset - headlineBottom - rowOffset)
  const imageH = rowGroups.length === 2 ? Math.min(baseImageH, twoRowMaxH) : baseImageH
  const previewH = imageH + (rowGroups.length - 1) * rowOffset
  const slotW = rowW / maxRowCount
  const imageW = Math.max(slotW * 1.75 * assetScale, imageH / 2.39)
  const previewTop = height - bottomOffset - previewH
  const layerTop = (rowGroups.length === 1 ? previewTop : Math.max(headlineBottom, previewTop)) - 30

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

function PhaseDots({ fontScale, phase }: { fontScale: number, phase: number }) {
  return (
    <View style={styles.dotsRow}>
      {PHASES.map((label, i) => {
        const color = i < phase ? C.aqua : i === phase ? C.purpleLight : C.pending
        return (
          <View key={label} style={styles.dotCol}>
            <View style={[styles.dot, { backgroundColor: color, width: scaled(8, fontScale), height: scaled(8, fontScale), borderRadius: scaled(4, fontScale) }]} />
            <Text style={[styles.dotLabel, { color: i <= phase ? C.ink : C.inkMuted, fontSize: scaled(9, fontScale) }]}>{label}</Text>
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
  const setPendingUpload = useAppStore((s) => s.setPendingUpload)
  const { width: viewportW } = useWindowDimensions()
  const fontScale = fontScaleForWidth(viewportW)
  const trackW = Math.max(180, viewportW - progressInsetForWidth(viewportW))

  const [fadeIn] = useState(() => new Animated.Value(0))
  const [errorMsg] = useState<string | null>(null)
  const [assetTop, setAssetTop] = useState(IS_WEB ? 180 : 120)

  // Intro animations (run once on mount).
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: !IS_WEB, easing: Easing.out(Easing.ease) }).start()
  }, [fadeIn])

  // Temporary extraction-page focus mode: visual-only progress loop. No pipeline,
  // no SQLite writes, and no navigation to bodymap.
  useEffect(() => {
    setPendingUpload(null)
    let progress = 0
    const tick = setInterval(() => {
      progress = (progress + 0.006) % 1
      setAnalyzeProgress(progress)
      setAnalyzePhase(Math.min(3, Math.floor(progress * 4)))
    }, 80)
    return () => clearInterval(tick)
  }, [setAnalyzeProgress, setAnalyzePhase, setPendingUpload])

  const pct = Math.round(analyzeProgress * 100)

  if (errorMsg) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.content}>
            <Logo fontScale={fontScale} />
            <Text style={[styles.headline, { fontSize: scaled(34, fontScale), lineHeight: scaled(32, fontScale) }]}>Couldn’t{'\n'}analyze</Text>
            <Text style={[styles.errorText, { fontSize: scaled(15, fontScale), lineHeight: scaled(21, fontScale) }]}>{errorMsg}</Text>
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
        <Animated.View style={[styles.content, { opacity: fadeIn }]}>
          <View style={[styles.topBlock, { gap: IS_WEB ? scaled(14, fontScale) : 14, top: Math.max(IS_WEB ? 10 : 6, assetTop - (IS_WEB ? scaled(112, fontScale) : 78)) }]}>
            <Logo fontScale={fontScale} />
            <Text style={[styles.headline, { fontSize: scaled(34, fontScale), lineHeight: scaled(32, fontScale) }]}>Analyzing{'\n'}records…</Text>
          </View>

          <AnatomyLayerPreview onTopChange={setAssetTop} />

          <View style={[styles.bottomBlock, { gap: IS_WEB ? scaled(10, fontScale) : 12 }]}>
            <View style={styles.phaseBlock}>
              <Text style={[styles.phaseName, { fontSize: scaled(15, fontScale) }]}>{PHASES[analyzePhase]}</Text>
              <Text style={[styles.phaseSub, { fontSize: scaled(12, fontScale) }]}>{pct}% — processing on-device</Text>
            </View>

            <PhaseDots fontScale={fontScale} phase={analyzePhase} />

            {/* Gradient progress bar */}
            <View style={[styles.barTrack, { width: trackW }]}>
              <View style={[styles.barClip, { width: analyzeProgress * trackW }]}>
                <Svg width={trackW} height={4}>
                  <Defs>
                    <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={C.purpleLight} />
                      <Stop offset="1" stopColor={C.aqua} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={trackW} height={4} rx={2} fill="url(#barGrad)" />
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
  dotCol: { alignItems: 'center', gap: 6, flex: 1 },
  dot: {},
  dotLabel: { fontFamily: 'BarlowCondensed-Regular', textAlign: 'center' },

  barTrack: { height: 4, backgroundColor: C.pending, borderRadius: 2, overflow: 'hidden' },
  barClip: { height: 4, overflow: 'hidden' },

  errorText: {
    fontFamily: 'BarlowCondensed-Regular', color: C.ink,
    textAlign: 'center', opacity: 0.85, paddingHorizontal: 8,
  },
  backBtn: {
    borderWidth: 1, borderColor: C.purpleLight, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  backBtnText: { fontFamily: 'BarlowCondensed-Bold', color: C.purpleLight, letterSpacing: 0.5 },
})
