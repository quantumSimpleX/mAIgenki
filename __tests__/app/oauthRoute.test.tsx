// Regression net for the OAuth completion route (pB05-T02). Exercises the
// three branches described in lmfPlan.md A9 step 8: native cold-launch
// success, native cold-launch with a missing/expired verifier, and the web
// path that just hands control back to the opener via
// maybeCompleteAuthSession(). The real exchange logic (oauth.ts) is mocked —
// it already has its own coverage in tests/lib/oauth.test.ts.

import { Platform } from 'react-native'
import { render, screen, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockUseLocalSearchParams = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}))

const mockMaybeCompleteAuthSession = jest.fn()
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: (...args: unknown[]) => mockMaybeCompleteAuthSession(...args),
}))

const mockUseOptionalDatabase = jest.fn()
jest.mock('@/lib/db/provider', () => ({
  useOptionalDatabase: () => mockUseOptionalDatabase(),
}))

const mockGetPendingVerifier = jest.fn()
const mockCompleteOAuthExchange = jest.fn()
const mockClearPendingVerifier = jest.fn()
jest.mock('@/lib/llm/oauth', () => ({
  getPendingVerifier: (...args: unknown[]) => mockGetPendingVerifier(...args),
  completeOAuthExchange: (...args: unknown[]) => mockCompleteOAuthExchange(...args),
  clearPendingVerifier: (...args: unknown[]) => mockClearPendingVerifier(...args),
}))

import OAuthOpenRouterScreen from '@/app/oauth/openrouter'

const fakeDb = { __fake: true } as unknown as import('expo-sqlite').SQLiteDatabase

describe('OAuth completion route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseOptionalDatabase.mockReturnValue(fakeDb)
  })

  it('web: calls maybeCompleteAuthSession and never touches the db', async () => {
    Platform.OS = 'web'
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' })

    render(<OAuthOpenRouterScreen />)

    await waitFor(() => expect(mockMaybeCompleteAuthSession).toHaveBeenCalledTimes(1))
    expect(mockGetPendingVerifier).not.toHaveBeenCalled()
    expect(mockCompleteOAuthExchange).not.toHaveBeenCalled()
    expect(mockClearPendingVerifier).not.toHaveBeenCalled()
  })

  it('native cold-launch success: completes the exchange and redirects home', async () => {
    Platform.OS = 'ios'
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' })
    mockGetPendingVerifier.mockResolvedValue('verifier-xyz')
    mockCompleteOAuthExchange.mockResolvedValue({ status: 'success' })

    render(<OAuthOpenRouterScreen />)

    await waitFor(() => expect(screen.getByText('Signed in with OpenRouter.')).toBeTruthy())
    expect(mockCompleteOAuthExchange).toHaveBeenCalledWith(fakeDb, 'abc123', 'verifier-xyz')
    expect(mockClearPendingVerifier).toHaveBeenCalledWith(fakeDb)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'), { timeout: 3000 })
  })

  it('native cold-launch with a missing/expired verifier: surfaces an error, clears the pending verifier, and redirects home without exchanging', async () => {
    Platform.OS = 'ios'
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' })
    mockGetPendingVerifier.mockResolvedValue(null)

    render(<OAuthOpenRouterScreen />)

    await waitFor(() => expect(screen.getByText(/session expired/i)).toBeTruthy())
    expect(mockCompleteOAuthExchange).not.toHaveBeenCalled()
    expect(mockClearPendingVerifier).toHaveBeenCalledWith(fakeDb)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'), { timeout: 3000 })
  })

  it('native cold-launch with a missing code: surfaces an error, clears the pending verifier, without reading it', async () => {
    Platform.OS = 'ios'
    mockUseLocalSearchParams.mockReturnValue({ code: undefined })

    render(<OAuthOpenRouterScreen />)

    await waitFor(() => expect(screen.getByText(/missing a code/i)).toBeTruthy())
    expect(mockGetPendingVerifier).not.toHaveBeenCalled()
    expect(mockCompleteOAuthExchange).not.toHaveBeenCalled()
    expect(mockClearPendingVerifier).toHaveBeenCalledWith(fakeDb)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'), { timeout: 3000 })
  })

  it('native cold-launch exchange failure: surfaces the error message from completeOAuthExchange and clears the pending verifier', async () => {
    Platform.OS = 'ios'
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc123' })
    mockGetPendingVerifier.mockResolvedValue('verifier-xyz')
    mockCompleteOAuthExchange.mockResolvedValue({ status: 'error', message: 'Authorization expired or invalid — try again.' })

    render(<OAuthOpenRouterScreen />)

    await waitFor(() => expect(screen.getByText('Authorization expired or invalid — try again.')).toBeTruthy())
    expect(mockClearPendingVerifier).toHaveBeenCalledWith(fakeDb)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'), { timeout: 3000 })
  })
})
