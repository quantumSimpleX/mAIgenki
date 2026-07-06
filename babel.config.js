module.exports = function (api) {
  // Cache per NODE_ENV so the test-only plugin below is added under jest but
  // never in Metro/production bundles.
  api.cache.using(() => process.env.NODE_ENV)
  const isTest = process.env.NODE_ENV === 'test'
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      'react-native-reanimated/plugin',
      // Rewrite dynamic import() → require() so jest can run platform-branched
      // extraction code without --experimental-vm-modules (mocks resolve via
      // require). Test env only — Metro keeps real import() for code-splitting.
      ...(isTest ? ['./babel-plugin-dynamic-import-to-require.js'] : []),
    ],
  }
}
