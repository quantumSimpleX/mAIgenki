import { ScrollViewStyleReset } from 'expo-router/html'
import { type PropsWithChildren } from 'react'

// Web-only document shell. Expo Router renders every web route inside this <html>.
// The viewport meta here is the single source of truth (app.json web.meta is
// unreliable in SDK 56). maximum-scale=1 + user-scalable=no disables the browser's
// own pinch-to-zoom on Android/Chrome so only the body-map layers scale; iOS Safari
// ignores those flags, so bodymap.tsx also preventDefault()s Safari gesture events.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

// Black background prevents a white flash before the app mounts; overscroll-behavior
// disables pull-to-refresh and rubber-banding so vertical drags stay in the app.
const globalCss = `
html, body { background-color: #000; overscroll-behavior: none; }
`
