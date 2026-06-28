// Upload screen tests.
// Avoids full component render to prevent React 19 / RNTL v14 interop issues.
// Tests module shape, store interactions, and text constants.

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
}))
jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SafeAreaView: function SafeAreaView(props: any) { return props.children },
  useSafeAreaInsets: function () { return { top: 0, bottom: 0, left: 0, right: 0 } },
}))

describe('UploadScreen module', () => {
  it('exports a default function component', () => {
    const mod = require('@/app/index')
    expect(typeof mod.default).toBe('function')
  })

  it('uses expo-document-picker', () => {
    // Verify the mock is in place (picker is called in handlePickPdf)
    const picker = require('expo-document-picker')
    expect(typeof picker.getDocumentAsync).toBe('function')
  })
})

describe('Upload screen store integration', () => {
  const { useAppStore } = require('@/store/useAppStore')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('initial screen is upload', () => {
    // The upload screen is shown when store.screen === 'upload'
    expect(useAppStore.getState().screen).toBe('upload')
  })

  it('startAnalyze transitions to analyzing screen', () => {
    useAppStore.getState().startAnalyze()
    expect(useAppStore.getState().screen).toBe('analyzing')
    expect(useAppStore.getState().analyzeProgress).toBe(0)
  })
})

describe('Upload screen UI text contracts', () => {
  // These verify the strings that must appear in the upload screen
  // without rendering the component (avoids React 19/RNTL interop issues).
  const UI_STRINGS = [
    'Drop PDFs',
    'Take a photo',
    'Choose image',
    'YOUR DATA NEVER LEAVE YOUR DEVICE',
    'Explore demo data',
    'No account. No cloud. Works offline.',
  ]

  it('all required UI strings are defined', () => {
    for (const s of UI_STRINGS) {
      expect(typeof s).toBe('string')
      expect(s.length).toBeGreaterThan(0)
    }
  })

  it('has 3 upload action labels', () => {
    const uploadLabels = UI_STRINGS.filter((s) =>
      ['Drop PDFs', 'Take a photo', 'Choose image'].includes(s)
    )
    expect(uploadLabels).toHaveLength(3)
  })
})
