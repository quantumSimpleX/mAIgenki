// Upgrade-nudge tests for analyzing.tsx (pB06-T01). Exercises DegradedBanner
// and ConnectProviderCta in isolation — the full AnalyzingScreen is not
// rendered here since its SVG/Animated tree exhausts the jest heap (see
// __tests__/screens/analyzing.test.tsx).

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react-native'
import { router } from 'expo-router'
import { useAppStore } from '@/store/useAppStore'
import { DegradedBanner, ConnectProviderCta } from '@/app/analyzing'

const savedState = { ...useAppStore.getState() }

beforeEach(() => {
  jest.clearAllMocks()
  useAppStore.setState({ ...savedState }, true)
})

describe('DegradedBanner', () => {
  it('renders the passive banner when llmStatus is degraded and processing is complete', async () => {
    useAppStore.setState({ llmStatus: 'degraded' })
    await render(<DegradedBanner complete />)
    expect(screen.getByText(/Free AI models are busy/)).toBeTruthy()
  })

  it('renders nothing before processing completes, even if degraded', async () => {
    useAppStore.setState({ llmStatus: 'degraded' })
    await render(<DegradedBanner complete={false} />)
    expect(screen.queryByText(/Free AI models are busy/)).toBeNull()
  })

  it('renders nothing when llmStatus is ok', async () => {
    useAppStore.setState({ llmStatus: 'ok' })
    await render(<DegradedBanner complete />)
    expect(screen.queryByText(/Free AI models are busy/)).toBeNull()
  })

  it('dismissing the banner hides it', async () => {
    useAppStore.setState({ llmStatus: 'degraded' })
    await render(<DegradedBanner complete />)
    expect(screen.getByText(/Free AI models are busy/)).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByText(/Free AI models are busy/)).toBeNull())
  })
})

describe('ConnectProviderCta', () => {
  it.each(['rate_limit', 'quota_billing'] as const)(
    'renders the CTA when exhausted with a %s failure',
    async (kind) => {
      useAppStore.setState({ llmStatus: 'exhausted', lastLlmFailureKind: kind })
      await render(<ConnectProviderCta />)
      expect(screen.getByText('Connect provider')).toBeTruthy()
    },
  )

  it.each(['network', 'auth', 'timeout', 'server'] as const)(
    'renders no CTA when exhausted with a %s failure',
    async (kind) => {
      useAppStore.setState({ llmStatus: 'exhausted', lastLlmFailureKind: kind })
      await render(<ConnectProviderCta />)
      expect(screen.queryByText('Connect provider')).toBeNull()
    },
  )

  it('renders no CTA when llmStatus is not exhausted', async () => {
    useAppStore.setState({ llmStatus: 'degraded', lastLlmFailureKind: 'rate_limit' })
    await render(<ConnectProviderCta />)
    expect(screen.queryByText('Connect provider')).toBeNull()
  })

  it('pressing the CTA sets openSettingsSection to provider and navigates to bodymap', async () => {
    useAppStore.setState({ llmStatus: 'exhausted', lastLlmFailureKind: 'quota_billing' })
    await render(<ConnectProviderCta />)
    fireEvent.press(screen.getByText('Connect provider'))
    expect(useAppStore.getState().openSettingsSection).toBe('provider')
    expect(router.replace).toHaveBeenCalledWith('/bodymap')
  })
})
