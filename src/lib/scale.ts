import { Dimensions, Platform } from 'react-native'

export const IS_WEB = Platform.OS === 'web'

// Dimensions.get('window') is a runtime function call — Metro can't inline it
// at build time, so it always evaluates in the browser with the real viewport
// width. Direct window.innerWidth access gets dead-code-eliminated by Metro's
// production bundler (it sees typeof window === undefined in Node.js build env).
const { width: SW } = Dimensions.get('window')

export const IS_DESKTOP = IS_WEB && SW >= 768
export const S = IS_DESKTOP ? 2 : 1

export const fs = (n: number): number => (S === 1 ? n : Math.round(n * S))
export const sc = (n: number): number => (S === 1 ? n : Math.round(n * S))
