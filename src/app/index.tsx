import { router } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useAppStore } from '@/store/useAppStore'

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

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <View style={styles.logoRow}>
      <Text style={styles.logoM}>m</Text>
      <Text style={styles.logoAI}>AI</Text>
      <Text style={styles.logoGenki}> Genki</Text>
    </View>
  )
}

// ── Upload zone icons (inline SVG-style views) ────────────────────────────────

function PdfIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconBox, { borderColor: color }]}>
      <View style={[styles.iconBoxFold, { backgroundColor: C.bg }]} />
      <View style={[styles.iconArrow, { borderColor: color }]} />
    </View>
  )
}

function CameraIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconBox, { borderColor: color, borderRadius: 8 }]}>
      <View style={[styles.cameraLens, { borderColor: color }]} />
      <View style={[styles.cameraNotch, { backgroundColor: color, opacity: 0.6 }]} />
    </View>
  )
}

function ImageIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconBox, { borderColor: color, borderRadius: 8 }]}>
      <View style={[styles.imageSun, { backgroundColor: color, opacity: 0.7 }]} />
      <View style={[styles.imageMountain, { borderBottomColor: color, opacity: 0.6 }]} />
    </View>
  )
}

// ── QS Wordmark ───────────────────────────────────────────────────────────────

// QS simplex mark SVG path (icon-black.svg, scaled to ~24px tall)
const QS_PATH = 'M153.3,240.9L265.1,95.7L158.9,0L0,95.7l114,145.4l-32.7,42.2L27,350.9h106.8h106.8l-54.3-67.7L153.3,240.9z M63.2,94.3l82.1-49.4l-20,159.9l-72.1-92h77.1l2.3-18.5H63.2z M212.4,112.7L142.1,204L162,45l54.6,49.2h-54.3l-2.3,18.5H212.4z M133.8,319.6H92.4l13.4-16.6l0.2-0.2l0.2-0.2l27.7-35.7l27.7,35.7l0.2,0.2l0.2,0.2l13.4,16.6H133.8z'

function QSWordmark() {
  return (
    <View style={styles.qsWrap} pointerEvents="none">
      <Text style={styles.qsBuiltBy}>BUILT BY</Text>
      <Svg width={17} height={22} viewBox="0 0 265.1 350.9">
        <Path fill="rgba(10,14,20,0.9)" d={QS_PATH} />
      </Svg>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const startAnalyze = useAppStore((s) => s.startAnalyze)

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
          <Logo />
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
                <PdfIcon color={C.purpleLight} />
                <Text style={styles.uploadColLabel}>Drop PDFs</Text>
              </TouchableOpacity>

              <View style={styles.uploadDivider} />

              {/* Camera */}
              <TouchableOpacity style={styles.uploadCol} onPress={handleCamera} activeOpacity={0.7}>
                <CameraIcon color={C.aqua} />
                <Text style={[styles.uploadColLabel, { color: C.aquaDark }]}>Take a photo</Text>
              </TouchableOpacity>

              <View style={styles.uploadDivider} />

              {/* Image */}
              <TouchableOpacity style={styles.uploadCol} onPress={handlePickImage} activeOpacity={0.7}>
                <ImageIcon color={C.purpleLight} />
                <Text style={styles.uploadColLabel}>Choose image</Text>
              </TouchableOpacity>
            </View>

            {/* Bottom strip */}
            <View style={styles.uploadStrip}>
              <Text style={styles.uploadStripText}>PDF · JPG · PNG · HEIC</Text>
            </View>
          </View>

          {/* Privacy badge */}
          <View style={styles.privacyBadge}>
            <View style={styles.lockDot} />
            <Text style={styles.privacyText}>Private — never leaves your device</Text>
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

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      {/* QS wordmark — absolute lower-right */}
      <QSWordmark />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },

  nav: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoM: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 18,
    color: C.ink,
    letterSpacing: 0,
  },
  logoAI: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 20,
    color: C.purpleLight,
    lineHeight: 20,
  },
  logoGenki: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 18,
    color: C.ink,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  eyebrow: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    color: C.purple,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headline: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 42,
    lineHeight: 40,
    color: C.ink,
    letterSpacing: -1,
    marginBottom: 14,
  },
  sub: {
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 16,
    color: C.inkMuted,
    lineHeight: 22,
    marginBottom: 24,
  },

  // Upload zone
  uploadZone: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: '#F5F0FD',
    marginBottom: 12,
    overflow: 'hidden',
  },
  uploadCols: {
    flexDirection: 'row',
    paddingTop: 24,
    paddingBottom: 20,
  },
  uploadCol: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  uploadDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 8,
    opacity: 0.5,
  },
  uploadColLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 13,
    color: C.purple,
    textAlign: 'center',
  },
  uploadStrip: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#EDE6FA',
  },
  uploadStripText: {
    fontFamily: 'SourceCodePro',
    fontSize: 11,
    color: C.aquaDark,
    letterSpacing: 0.5,
  },

  // Icons
  iconBox: {
    width: 36,
    height: 44,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  iconBoxFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderBottomLeftRadius: 3,
  },
  iconArrow: {
    width: 12,
    height: 12,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    transform: [{ rotate: '225deg' }],
    marginTop: 4,
  },
  cameraLens: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  cameraNotch: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 6,
    height: 4,
    borderRadius: 2,
  },
  imageSun: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 10,
    right: 9,
  },
  imageMountain: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    position: 'absolute',
    bottom: 8,
    left: 6,
  },

  // Privacy badge
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.privacyBorder,
    marginBottom: 20,
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.privacyText,
  },
  privacyText: {
    fontFamily: 'SourceCodePro',
    fontSize: 11,
    color: C.privacyText,
  },

  // OR divider
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  orText: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
    color: C.inkMuted,
    letterSpacing: 1,
  },

  // Demo CTA
  demoBtn: {
    backgroundColor: C.purple,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  demoBtnText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
    color: C.white,
    letterSpacing: 0.5,
  },

  footer: {
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 13,
    color: C.aquaDark,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // QS wordmark
  qsWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    alignItems: 'center',
    opacity: 0.4,
  },
  qsBuiltBy: {
    fontFamily: 'BarlowCondensed-Regular',
    fontSize: 9,
    color: C.qsLabel,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
})
