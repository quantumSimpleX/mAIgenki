import { router } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import { useAppStore } from '@/store/useAppStore'

const C = {
  bg: '#FAFAF7',
  ink: '#0A0E14',
  inkMuted: '#5A6573',
  border: '#CDD2D9',
  purple: '#7042D6',
  purpleLight: '#8A60EB',
  purpleTint: '#F0EAFB',
  uploadBg: '#F5F0FD',
  white: '#FFFFFF',
}

function Logo() {
  return (
    <View style={styles.logoRow}>
      <Text style={styles.logoM}>m</Text>
      <Text style={styles.logoAI}>AI</Text>
      <Text style={styles.logoGenki}> Genki</Text>
    </View>
  )
}

function UploadIcon() {
  return (
    <View style={styles.uploadIconWrap}>
      <View style={styles.uploadIconDoc}>
        <View style={styles.uploadIconDocFold} />
        <View style={styles.uploadIconArrow} />
      </View>
    </View>
  )
}

function PrivacyBadge() {
  return (
    <View style={styles.privacyBadge}>
      <View style={styles.lockDot} />
      <Text style={styles.privacyText}>Private — never leaves your device</Text>
    </View>
  )
}

function SamplePill({ label }: { label: string }) {
  return (
    <View style={styles.samplePill}>
      <Text style={styles.samplePillText}>{label}</Text>
    </View>
  )
}

function QSWordmark() {
  return (
    <View style={styles.qsWrap} pointerEvents="none">
      <Text style={styles.qsText}>QS</Text>
    </View>
  )
}

export default function UploadScreen() {
  const startAnalyze = useAppStore((s) => s.startAnalyze)

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    })
    if (result.canceled) return
    startAnalyze()
    router.push('/analyzing')
  }

  function handleDemo() {
    startAnalyze()
    router.push('/analyzing')
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
          <Text style={styles.headline}>YOUR{'\n'}WELLNESS{'\n'}STORY</Text>

          {/* Body */}
          <Text style={styles.body}>
            Upload health record PDFs. Every condition mapped to anatomy — across time.
          </Text>

          {/* Upload zone */}
          <TouchableOpacity style={styles.uploadZone} onPress={handlePickFile} activeOpacity={0.8}>
            <UploadIcon />
            <Text style={styles.uploadTitle}>Drop PDF here</Text>
            <Text style={styles.uploadSub}>or tap to choose</Text>
            <PrivacyBadge />
          </TouchableOpacity>

          {/* Or choose image */}
          <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickFile} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Choose image / scan</Text>
          </TouchableOpacity>

          {/* CTA */}
          <TouchableOpacity style={styles.demoBtn} onPress={handleDemo} activeOpacity={0.85}>
            <Text style={styles.demoBtnText}>Try with sample records</Text>
          </TouchableOpacity>

          {/* Sample pills */}
          <View style={styles.pillRow}>
            <SamplePill label="22 conditions" />
            <SamplePill label="11 organ systems" />
            <SamplePill label="2013 — 2024" />
          </View>

          {/* Sub copy */}
          <Text style={styles.subCopy}>No account. No cloud. Works offline.</Text>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      {/* QS wordmark — absolute overlay */}
      <QSWordmark />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  nav: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoM: {
    fontFamily: 'MOMCAKE-Thin',
    fontSize: 20,
    color: C.ink,
    letterSpacing: -0.5,
  },
  logoAI: {
    fontFamily: 'MOMCAKE-Bold',
    fontSize: 20,
    color: C.purpleLight,
    letterSpacing: -0.5,
  },
  logoGenki: {
    fontFamily: 'MOMCAKE-Thin',
    fontSize: 20,
    color: C.ink,
    letterSpacing: -0.5,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
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
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: C.inkMuted,
    lineHeight: 23,
    marginBottom: 28,
  },
  uploadZone: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: C.uploadBg,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadIconWrap: { marginBottom: 12 },
  uploadIconDoc: {
    width: 40,
    height: 50,
    borderRadius: 6,
    backgroundColor: C.purpleTint,
    borderWidth: 1.5,
    borderColor: C.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  uploadIconDocFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: C.bg,
    borderBottomLeftRadius: 4,
  },
  uploadIconArrow: {
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: C.purpleLight,
    transform: [{ rotate: '225deg' }],
    marginTop: 4,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.ink,
    marginBottom: 4,
  },
  uploadSub: {
    fontSize: 13,
    color: C.inkMuted,
    marginBottom: 16,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  privacyText: {
    fontSize: 11,
    color: C.inkMuted,
    fontWeight: '500',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: C.white,
  },
  secondaryBtnText: {
    fontSize: 15,
    color: C.inkMuted,
    fontWeight: '500',
  },
  demoBtn: {
    backgroundColor: C.purple,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 14,
  },
  demoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.white,
    letterSpacing: 0.2,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  samplePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  samplePillText: {
    fontSize: 12,
    color: C.inkMuted,
    fontWeight: '500',
  },
  subCopy: {
    fontSize: 12,
    color: C.border,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  qsWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    opacity: 0.25,
  },
  qsText: {
    fontFamily: 'BourbonGrotesque',
    fontSize: 22,
    color: C.ink,
    letterSpacing: 2,
  },
})
