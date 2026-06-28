module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx',
    '**/tests/**/*.test.ts', '**/tests/**/*.test.tsx',
  ],
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', 'src/model/**/*.{ts,tsx}', 'src/store/**/*.{ts,tsx}'],
  coverageThreshold: {
    global: { lines: 80 },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/(?!modules-core)|@expo-google-fonts|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
}
