import { Dimensions, Platform } from 'react-native'

// Desktop web renders this mobile-first UI at tiny phone sizes. Scale the chrome
// (fonts + the containers that wrap them) up so text is accessible on desktop;
// mobile/native is left at 1× (byte-identical sizing). fs() = fonts, sc() =
// spacing/dimensions. Captured once at load — for live-resize responsiveness use
// useWindowDimensions in the component instead.
const { width: SW } = Dimensions.get('window')

export const IS_WEB = Platform.OS === 'web'
export const IS_DESKTOP = IS_WEB && SW >= 768
export const S = IS_DESKTOP ? 2 : 1

export const fs = (n: number): number => (S === 1 ? n : Math.round(n * S))
export const sc = (n: number): number => (S === 1 ? n : Math.round(n * S))
