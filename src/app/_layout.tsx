import '../global.css'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'MOMCAKE-Bold': require('../../assets/fonts/MOMCAKE-Bold.otf'),
    'MOMCAKE-Thin': require('../../assets/fonts/MOMCAKE-Thin.otf'),
    'BourbonGrotesque': require('../../assets/fonts/BourbonGrotesque-Regular.otf'),
  })

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="analyzing" />
        <Stack.Screen name="bodymap" />
      </Stack>
    </>
  )
}
