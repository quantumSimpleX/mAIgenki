// Connect-button wiring tests for ProviderSettings.tsx (pB05-T03). Exercises
// the three branches the kanban card's acceptance criteria call out: a
// successful connectOpenRouter() call flips the store to tier 1 and offers
// the model-pick affordance, a user cancel leaves tier 0 untouched, and a
// 403-style exchange failure surfaces oauth.ts's distinct "try again"
// message. connectOpenRouter/loadProfile/saveProfile/makeKeyStore are mocked
// — they already have their own coverage in tests/lib/oauth.test.ts and
// tests/lib/profile.test.ts.

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import type { LMFProfile } from '@/lib/lmf/types'

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}))

const mockUseOptionalDatabase = jest.fn()
jest.mock('@/lib/db/provider', () => ({
  useOptionalDatabase: () => mockUseOptionalDatabase(),
}))

const mockConnectOpenRouter = jest.fn()
jest.mock('@/lib/llm/oauth', () => ({
  connectOpenRouter: (...args: unknown[]) => mockConnectOpenRouter(...args),
}))

const mockLoadProfile = jest.fn()
const mockSaveProfile = jest.fn()
jest.mock('@/lib/llm/profile', () => ({
  loadProfile: (...args: unknown[]) => mockLoadProfile(...args),
  saveProfile: (...args: unknown[]) => mockSaveProfile(...args),
}))

jest.mock('@/lib/llm/keystore', () => ({
  makeKeyStore: jest.fn(async () => ({
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    delete: jest.fn(async () => {}),
  })),
}))

import { useAppStore } from '@/store/useAppStore'
import { ProviderSettings } from '@/components/ProviderSettings'

const DEFAULT_PROFILE: LMFProfile = {
  tier: 0,
  activeProviderId: null,
  model: null,
  customBaseURL: null,
  fallbackToFree: true,
  keySource: null,
}

const fakeDb = { __fake: true } as unknown as import('expo-sqlite').SQLiteDatabase
const savedStoreState = { ...useAppStore.getState() }

beforeEach(() => {
  jest.clearAllMocks()
  useAppStore.setState({ ...savedStoreState, llmTier: 0, llmStatus: 'ok' }, true)
  mockUseOptionalDatabase.mockReturnValue(fakeDb)
  mockLoadProfile.mockResolvedValue({ ...DEFAULT_PROFILE })
})

describe('ProviderSettings — Connect OpenRouter wiring', () => {
  it('successful connect flips the store to tier 1 and offers the model-pick affordance', async () => {
    mockConnectOpenRouter.mockResolvedValue({ status: 'success' })
    mockLoadProfile
      .mockResolvedValueOnce({ ...DEFAULT_PROFILE }) // initial mount
      .mockResolvedValueOnce({ ...DEFAULT_PROFILE, tier: 1, activeProviderId: 'openrouter', keySource: 'oauth' }) // post-connect

    render(<ProviderSettings />)
    await waitFor(() => expect(mockLoadProfile).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getAllByText('Connect')[0])

    await waitFor(() => expect(mockConnectOpenRouter).toHaveBeenCalledWith(fakeDb))
    await waitFor(() => expect(screen.getByText(/Tier 1/)).toBeTruthy())

    expect(useAppStore.getState().llmTier).toBe(1)
    expect(screen.getByText('Connected via OpenRouter — pick a model below.')).toBeTruthy()
    // This card reacts to the result — it must not re-persist what oauth.ts already wrote.
    expect(mockSaveProfile).not.toHaveBeenCalled()
  })

  it('cancel leaves tier 0 unchanged and shows no error', async () => {
    mockConnectOpenRouter.mockResolvedValue({ status: 'cancelled' })

    render(<ProviderSettings />)
    await waitFor(() => expect(mockLoadProfile).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getAllByText('Connect')[0])

    await waitFor(() => expect(mockConnectOpenRouter).toHaveBeenCalled())
    expect(screen.getByText(/Tier 0/)).toBeTruthy()
    expect(useAppStore.getState().llmTier).toBe(0)
    expect(mockSaveProfile).not.toHaveBeenCalled()
    // loadProfile only runs once — the mount effect — cancel never re-fetches.
    expect(mockLoadProfile).toHaveBeenCalledTimes(1)
  })

  it('a 403-style exchange failure surfaces the distinct "try again" message and leaves tier 0 intact', async () => {
    mockConnectOpenRouter.mockResolvedValue({
      status: 'error',
      message: 'Authorization expired or invalid — try again.',
    })

    render(<ProviderSettings />)
    await waitFor(() => expect(mockLoadProfile).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getAllByText('Connect')[0])

    await waitFor(() =>
      expect(screen.getByText('Authorization expired or invalid — try again.')).toBeTruthy())
    expect(screen.getByText(/Tier 0/)).toBeTruthy()
    expect(useAppStore.getState().llmTier).toBe(0)
  })
})
