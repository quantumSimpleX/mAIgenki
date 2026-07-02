import { Platform } from 'react-native'

export const IS_WEB = Platform.OS === 'web'

// Read directly from window so this works correctly in SPA mode (no SSR).
// Dimensions.get('window') calls window.innerWidth too, but window.screen.width
// is a safe fallback for the rare race where innerWidth is 0 at script eval time.
const SW = IS_WEB && typeof window !== 'undefined'
  ? (window.innerWidth || window.screen?.width || 0)
  : 0

export const IS_DESKTOP = IS_WEB && SW >= 768
export const S = IS_DESKTOP ? 2 : 1

export const fs = (n: number): number => (S === 1 ? n : Math.round(n * S))
export const sc = (n: number): number => (S === 1 ? n : Math.round(n * S))
