import { Dimensions, Platform } from 'react-native'

export const IS_WEB = Platform.OS === 'web'

// Dimensions.get('window') is a runtime function call — Metro can't inline it
// at build time, so it always evaluates in the browser with the real viewport
// width. Direct window.innerWidth access gets dead-code-eliminated by Metro's
// production bundler (it sees typeof window === undefined in Node.js build env).
const { width: SW } = Dimensions.get('window')
const MOBILE_BASE_WIDTH = 390

export const IS_DESKTOP = IS_WEB && SW >= 768
// Keep mobile at the 1x baseline and scale continuously toward the 2x desktop
// layout as the viewport grows, avoiding a breakpoint-sized jump in typography.
export const S = IS_WEB ? Math.min(2, Math.max(1, SW / MOBILE_BASE_WIDTH)) : 1

export const fs = (n: number): number => n * S
export const sc = (n: number): number => n * S
