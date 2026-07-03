import { useMemo } from 'react'
import { router } from 'expo-router'
import {
  StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useAppStore } from '@/store/useAppStore'
import { useConditions } from '@/hooks/useConditions'
import { QSWordmark } from '@/components/QSWordmark'
import { IS_DESKTOP, IS_WEB, S } from '@/lib/scale'

const C = {
  bg: '#FAFAF7',
  ink: '#0A0E14',
  inkMuted: '#5A6573',
  border: '#CDD2D9',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  purpleTint: '#F0EAFB',
  aqua: '#1FC3A4',
  aquaDark: '#1A9E8A',
  white: '#FFFFFF',
  privacyText: '#6B3FBF',
  privacyBorder: '#C4A8F0',
  qsLabel: '#A6ADB7',
}

type Styles = ReturnType<typeof createStyles>

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo({ s }: { s: Styles }) {
  return (
    <View style={s.logoRow}>
      <Text style={s.logoM}>m</Text>
      <Text style={s.logoAI}>AI</Text>
      <Text style={s.logoGenki}> Genki</Text>
    </View>
  )
}

// ── Upload zone icons (inline SVG-style views) ────────────────────────────────

function PdfIcon({ color, s }: { color: string; s: Styles }) {
  return (
    <View style={[s.iconBox, { borderColor: color }]}>
      <View style={[s.iconBoxFold, { backgroundColor: C.bg }]} />
      <View style={[s.iconArrow, { borderColor: color }]} />
    </View>
  )
}

function CameraIcon({ color, s }: { color: string; s: Styles }) {
  return (
    <View style={[s.iconBox, { borderColor: color, borderRadius: 8 }]}>
      <View style={[s.cameraLens, { borderColor: color }]} />
      <View style={[s.cameraNotch, { backgroundColor: color, opacity: 0.6 }]} />
    </View>
  )
}

function ImageIcon({ color, s }: { color: string; s: Styles }) {
  return (
    <View style={[s.iconBox, { borderColor: color, borderRadius: 8 }]}>
      <View style={[s.imageSun, { backgroundColor: color, opacity: 0.7 }]} />
      <View style={[s.imageMountain, { borderBottomColor: color, opacity: 0.6 }]} />
    </View>
  )
}

// ── QS Wordmark ───────────────────────────────────────────────────────────────

function QSBadge({ s, size }: { s: Styles; size: number }) {
  // "BUILT BY" left-aligns with the "U" of UANTUM (past the Q icon = icon width
  // + the wordmark's row gap of 1) and is sized + tracked to span the width of
  // the "UANTUM SIMPLEX" lockup.
  const textIndent = size + 1
  const builtByFs = Math.round(size * 0.4)
  return (
    <View style={[s.qsWrap, { pointerEvents: 'none' }]}>
      <Text style={[s.qsBuiltBy, { marginLeft: textIndent, fontSize: builtByFs, letterSpacing: builtByFs * 0.34 }]}>
        BUILT BY
      </Text>
      <QSWordmark size={size} onDark={false} />
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const startAnalyze = useAppStore((s) => s.startAnalyze)
  const [conditions] = useConditions()
  const { height: winH } = useWindowDimensions()

  // Live stats from the seeded conditions (falls back to bundled demo data when
  // the DB is unavailable): condition count, distinct organ systems, and the
  // span between the earliest and latest dated entry.
  const condCount = conditions.length
  const systemCount = new Set(conditions.map((c) => c.system)).size
  // Parse the year from each entry's date string ("YYYY-MMM-DD"); robust whether
  // conditions come from SQLite or the bundled fallback.
  const years = conditions
    .map((c) => parseInt((c.date ?? '').slice(0, 4), 10))
    .filter((y) => Number.isFinite(y) && y > 1900)
  const minYear = years.length ? Math.min(...years) : 0
  const maxYear = years.length ? Math.max(...years) : 0
  const sampleSummary = `${condCount} conditions | ${systemCount} organ systems | ${minYear} — ${maxYear}`

  // On desktop, scale the whole page to fit one vertical screen (no scroll):
  // shrink from the 2× desktop max as the viewport gets shorter. ~640 is the
  // page's natural height at 1×. Mobile/native stays at 1×.
  const ls = IS_DESKTOP ? Math.max(1, Math.min(S, (winH - 16) / 640)) : 1
  const styles = useMemo(() => createStyles((n) => Math.round(n * ls), (n) => Math.round(n * ls)), [ls])
  const wordmarkSize = Math.round(28 * ls)

  async function handlePickPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    })
    if (result.canceled) return
    startAnalyze()
    router.push('/analyzing')
  }

  async function handleCamera() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 })
    if (result.canceled) return
    startAnalyze()
    router.push('/analyzing')
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled) return
    startAnalyze()
    router.push('/analyzing')
  }

  function handleDemo() {
    router.push('/bodymap')
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Nav */}
        <View style={styles.nav}>
          <Logo s={styles} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Eyebrow */}
          <Text style={styles.eyebrow}>YOUR BODY. YOUR RECORDS.</Text>

          {/* Headline */}
          <Text style={styles.headline}>{'YOUR\nWELLNESS\nSTORY'}</Text>

          {/* Sub */}
          <Text style={styles.sub}>
            Upload health PDFs. Every condition mapped to anatomy — across time.
          </Text>

          {/* Upload zone — 3 columns */}
          <View style={styles.uploadZone}>
            <View style={styles.uploadCols}>
              {/* PDF */}
              <TouchableOpacity style={styles.uploadCol} onPress={handlePickPdf} activeOpacity={0.7}>
                <PdfIcon color={C.purpleLight} s={styles} />
                <Text style={styles.uploadColLabel}>Drop PDFs</Text>
              </TouchableOpacity>

              <View style={styles.uploadDivider} />

              {/* Camera — no camera capture in the browser */}
              {!IS_WEB && (
                <>
                  <TouchableOpacity style={styles.uploadCol} onPress={handleCamera} activeOpacity={0.7}>
                    <CameraIcon color={C.aqua} s={styles} />
                    <Text style={[styles.uploadColLabel, { color: C.aquaDark }]}>Take a photo</Text>
                  </TouchableOpacity>

                  <View style={styles.uploadDivider} />
                </>
              )}

              {/* Image */}
              <TouchableOpacity style={styles.uploadCol} onPress={handlePickImage} activeOpacity={0.7}>
                <ImageIcon color={C.purpleLight} s={styles} />
                <Text style={styles.uploadColLabel}>Choose image</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom strip */}
            <View style={styles.uploadStrip}>
              <Text style={styles.uploadStripText}>
                Health records, discharge forms, lab results, imaging reports, etc.
              </Text>
            </View>
          </View>

          {/* Privacy badge */}
          <View style={styles.privacyBadge}>
            <View style={styles.lockDot} />
            <Text style={styles.privacyText}>YOUR DATA NEVER LEAVE YOUR DEVICE</Text>
          </View>

          {/* OR divider */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          {/* Demo CTA */}
          <TouchableOpacity style={styles.demoBtn} onPress={handleDemo} activeOpacity={0.85}>
            <Text style={styles.demoBtnText}>Explore demo data</Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>No account. No cloud. Works offline.</Text>

          {/* Sample data preview */}
          <Text style={styles.samplePreview}>{sampleSummary}</Text>

          <View style={styles.spacer} />
        </ScrollView>
      </SafeAreaView>

      {/* QS wordmark — absolute lower-right */}
      <QSBadge s={styles} size={wordmarkSize} />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(fs: (n: number) => number, sc: (n: number) => number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    safe: { flex: 1 },

    nav: { paddingHorizontal: sc(20), paddingTop: sc(8), paddingBottom: sc(8) },
    logoRow: { flexDirection: 'row', alignItems: 'baseline' },
    logoM: {
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: fs(18),
      color: C.ink,
      letterSpacing: 0,
    },
    logoAI: {
      fontFamily: 'MOMCAKE-Bold',
      fontSize: fs(20),
      color: C.purpleLight,
      lineHeight: fs(20),
    },
    logoGenki: {
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: fs(18),
      color: C.ink,
    },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: sc(20), paddingTop: sc(16) },

    eyebrow: {
      fontFamily: 'BarlowCondensed-SemiBold',
      fontSize: fs(11),
      color: C.purple,
      letterSpacing: sc(1.2),
      textTransform: 'uppercase',
      marginBottom: sc(8),
    },
    headline: {
      fontFamily: 'MOMCAKE-Bold',
      fontSize: fs(42),
      lineHeight: fs(40),
      color: C.ink,
      letterSpacing: sc(-1),
      marginBottom: sc(12),
    },
    sub: {
      fontFamily: 'BarlowCondensed-Regular',
      fontSize: fs(16),
      color: C.inkMuted,
      lineHeight: fs(22),
      marginBottom: sc(18),
    },

    // Upload zone
    uploadZone: {
      borderWidth: 1.5,
      borderColor: C.border,
      borderStyle: 'dashed',
      borderRadius: sc(8),
      backgroundColor: '#F5F0FD',
      marginBottom: sc(12),
      overflow: 'hidden',
    },
    uploadCols: {
      flexDirection: 'row',
      paddingTop: sc(20),
      paddingBottom: sc(16),
    },
    uploadCol: {
      flex: 1,
      alignItems: 'center',
      gap: sc(10),
    },
    uploadDivider: {
      width: 1,
      backgroundColor: C.border,
      marginVertical: sc(8),
      opacity: 0.5,
    },
    uploadColLabel: {
      fontFamily: 'BarlowCondensed-SemiBold',
      fontSize: fs(13),
      color: C.purple,
      textAlign: 'center',
    },
    uploadStrip: {
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingVertical: sc(8),
      alignItems: 'center',
      backgroundColor: '#EDE6FA',
    },
    uploadStripText: {
      fontFamily: 'BarlowCondensed-Regular',
      fontSize: fs(13),
      color: C.aquaDark,
      letterSpacing: sc(0.3),
      textAlign: 'center',
      paddingHorizontal: sc(12),
    },

    // Icons
    iconBox: {
      width: sc(36),
      height: sc(44),
      borderWidth: 1.5,
      borderRadius: sc(5),
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    iconBoxFold: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: sc(10),
      height: sc(10),
      borderBottomLeftRadius: sc(3),
    },
    iconArrow: {
      width: sc(12),
      height: sc(12),
      borderTopWidth: 2,
      borderLeftWidth: 2,
      transform: [{ rotate: '225deg' }],
      marginTop: sc(4),
    },
    cameraLens: {
      width: sc(14),
      height: sc(14),
      borderRadius: sc(7),
      borderWidth: 1.5,
    },
    cameraNotch: {
      position: 'absolute',
      top: sc(6),
      left: sc(8),
      width: sc(6),
      height: sc(4),
      borderRadius: sc(2),
    },
    imageSun: {
      width: sc(8),
      height: sc(8),
      borderRadius: sc(4),
      position: 'absolute',
      top: sc(10),
      right: sc(9),
    },
    imageMountain: {
      width: 0,
      height: 0,
      borderLeftWidth: sc(10),
      borderRightWidth: sc(10),
      borderBottomWidth: sc(12),
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      position: 'absolute',
      bottom: sc(8),
      left: sc(6),
    },

    // Privacy badge
    privacyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sc(6),
      alignSelf: 'center',
      paddingHorizontal: sc(12),
      paddingVertical: sc(5),
      borderRadius: sc(20),
      borderWidth: 1,
      borderColor: C.privacyBorder,
      marginBottom: sc(16),
    },
    lockDot: {
      width: sc(6),
      height: sc(6),
      borderRadius: sc(3),
      backgroundColor: C.privacyText,
    },
    privacyText: {
      fontFamily: 'SourceCodePro',
      fontSize: fs(11),
      color: C.privacyText,
      textTransform: 'uppercase',
      letterSpacing: sc(0.5),
    },

    // OR divider
    orRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: sc(10),
      marginBottom: sc(14),
    },
    orLine: { flex: 1, height: 1, backgroundColor: C.border },
    orText: {
      fontFamily: 'BarlowCondensed-SemiBold',
      fontSize: fs(11),
      color: C.inkMuted,
      letterSpacing: sc(1),
    },

    // Demo CTA
    demoBtn: {
      backgroundColor: C.purple,
      borderRadius: sc(10),
      paddingVertical: sc(14),
      alignItems: 'center',
      marginBottom: sc(16),
    },
    demoBtnText: {
      fontFamily: 'BarlowCondensed-Bold',
      fontSize: fs(16),
      color: C.white,
      letterSpacing: sc(0.5),
    },

    footer: {
      fontFamily: 'BarlowCondensed-Regular',
      fontSize: fs(13),
      color: C.aquaDark,
      textAlign: 'center',
      letterSpacing: sc(0.3),
    },
    samplePreview: {
      fontFamily: 'BarlowCondensed-Regular',
      fontSize: fs(11),
      color: C.aquaDark,
      opacity: 0.6,
      textAlign: 'center',
      marginTop: sc(6),
    },

    spacer: { height: sc(24) },

    // QS wordmark
    qsWrap: {
      position: 'absolute',
      bottom: sc(24),
      right: sc(20),
      alignItems: 'flex-start',
      opacity: 0.55,
    },
    qsBuiltBy: {
      fontFamily: 'BarlowCondensed-Bold',
      color: C.qsLabel,
      textTransform: 'uppercase',
      marginBottom: sc(2),
    },
  })
}
