import { useEffect, useRef } from 'react'
import { router } from 'expo-router'
import {
  Animated, Easing, StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Ellipse, Line, Path, Circle } from 'react-native-svg'
import { useAppStore } from '@/store/useAppStore'

const C = {
  bg: '#0A0E14',
  ink: '#FAFAF7',
  inkMuted: '#5A6573',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  scanLine: 'rgba(112, 66, 214, 0.35)',
}

const PHASES = [
  'Reading document…',
  'Extracting text…',
  'Identifying conditions…',
  'Mapping to anatomy…',
  'Building timeline…',
]

const SYSTEM_COLORS = [
  '#4F46E5', '#F472B6', '#94A3B8', '#EF4444', '#22C55E',
  '#EAB308', '#06B6D4', '#F97316', '#84CC16', '#D946EF', '#7F1D1D',
]

function ScanDots({ phase }: { phase: number }) {
  return (
    <View style={styles.dotsRow}>
      {PHASES.map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < phase && { backgroundColor: C.purpleLight },
            i === phase && { backgroundColor: C.purple, transform: [{ scale: 1.3 }] },
          ]}
        />
      ))}
    </View>
  )
}

function BodySilhouette() {
  return (
    <Svg width={180} height={340} viewBox="0 0 180 340" fill="none">
      {/* Head */}
      <Ellipse cx={90} cy={32} rx={26} ry={30} stroke="#2A3040" strokeWidth={1.5} />
      {/* Neck */}
      <Path d="M79 60 L79 78 M101 60 L101 78" stroke="#2A3040" strokeWidth={1.5} />
      {/* Torso */}
      <Path
        d="M55 78 Q42 90 40 130 L36 210 Q36 230 55 234 L55 280 Q55 295 68 295 L112 295 Q125 295 125 280 L125 234 Q144 230 144 210 L140 130 Q138 90 125 78 Z"
        stroke="#2A3040" strokeWidth={1.5} fill="transparent"
      />
      {/* Arms */}
      <Path d="M55 82 Q32 100 24 155 Q22 170 26 180 Q30 188 38 184 Q44 178 46 160 L52 118" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      <Path d="M125 82 Q148 100 156 155 Q158 170 154 180 Q150 188 142 184 Q136 178 134 160 L128 118" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      {/* Legs */}
      <Path d="M68 295 L62 380 Q60 400 70 400 Q80 400 82 380 L84 310" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
      <Path d="M112 295 L118 380 Q120 400 110 400 Q100 400 98 380 L96 310" stroke="#2A3040" strokeWidth={1.5} fill="transparent" />
    </Svg>
  )
}

function SystemOrbs({ progress }: { progress: number }) {
  const revealed = Math.floor(progress * SYSTEM_COLORS.length)
  const positions = [
    [90, 32], [62, 92], [118, 92], [90, 155], [90, 115],
    [90, 55], [90, 195], [90, 230], [90, 270], [90, 105], [90, 310],
  ]
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={180} height={340} viewBox="0 0 180 340">
        {positions.slice(0, revealed).map(([cx, cy], i) => (
          <Circle
            key={i}
            cx={cx} cy={cy} r={5}
            fill={SYSTEM_COLORS[i % SYSTEM_COLORS.length]}
            opacity={0.85}
          />
        ))}
      </Svg>
    </View>
  )
}

export default function AnalyzingScreen() {
  const { analyzeProgress, analyzePhase, setAnalyzeProgress, setAnalyzePhase, setScreen } = useAppStore()

  const scanY = useRef(new Animated.Value(-10)).current
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1, duration: 400,
      useNativeDriver: true, easing: Easing.out(Easing.ease),
    }).start()

    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, { toValue: 350, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(scanY, { toValue: -10, duration: 0, useNativeDriver: true }),
      ])
    )
    scanLoop.start()

    let progress = 0
    let phase = 0
    const tick = setInterval(() => {
      progress = Math.min(1, progress + 0.012)
      phase = Math.min(PHASES.length - 1, Math.floor(progress * PHASES.length))
      setAnalyzeProgress(progress)
      setAnalyzePhase(phase)
      if (progress >= 1) {
        clearInterval(tick)
        scanLoop.stop()
        setScreen('bodymap')
        setTimeout(() => router.replace('/bodymap'), 400)
      }
    }, 80)

    return () => {
      clearInterval(tick)
      scanLoop.stop()
    }
  }, [])

  const barWidth = `${Math.round(analyzeProgress * 100)}%`

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.content, { opacity: fadeIn }]}>
          <Text style={styles.headline}>Analyzing{'\n'}records…</Text>

          {/* Body silhouette + scan line */}
          <View style={styles.bodyWrap}>
            <BodySilhouette />
            <SystemOrbs progress={analyzeProgress} />
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanY }] },
              ]}
              pointerEvents="none"
            />
          </View>

          {/* Phase label */}
          <Text style={styles.phaseLabel}>{PHASES[analyzePhase]}</Text>

          {/* Phase dots */}
          <ScanDots phase={analyzePhase} />

          {/* Progress bar */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { width: barWidth as any }]} />
          </View>

          <Text style={styles.pct}>{Math.round(analyzeProgress * 100)}%</Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  headline: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 34,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -1,
  },
  bodyWrap: {
    width: 180,
    height: 340,
    position: 'relative',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.purpleLight,
    shadowColor: C.purpleLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  phaseLabel: {
    fontSize: 14,
    color: C.inkMuted,
    letterSpacing: 0.3,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1E2535',
  },
  barTrack: {
    width: '100%',
    height: 3,
    backgroundColor: '#1E2535',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    backgroundColor: C.purple,
    borderRadius: 2,
  },
  pct: {
    fontSize: 12,
    color: C.inkMuted,
    letterSpacing: 1,
    fontWeight: '600',
  },
})
