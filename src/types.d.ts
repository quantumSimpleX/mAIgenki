/// <reference types="expo/types" />

// CSS side-effect imports (NativeWind global.css)
declare module '*.css'

// CSS modules (animated-icon.module.css etc.)
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
