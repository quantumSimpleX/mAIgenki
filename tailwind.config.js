/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // App is always dark-themed; 'class' lets the color scheme be set manually
  // without react-native-css-interop throwing ("dark mode is type 'media'").
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
