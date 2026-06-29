import '../global.css'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { DatabaseProvider } from '@/lib/db/provider'
import { SettingsHydrator } from '@/hooks/useSettingsPersistence'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'MOMCAKE-Bold': require('../../assets/fonts/MOMCAKE-Bold.otf'),
    'MOMCAKE-Thin': require('../../assets/fonts/MOMCAKE-Thin.otf'),
    'BourbonGrotesque': require('../../assets/fonts/BourbonGrotesque-Regular.otf'),
    'BarlowCondensed-Regular': require('@expo-google-fonts/barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf'),
    'BarlowCondensed-SemiBold': require('@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf'),
    'BarlowCondensed-Bold': require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
    'SourceCodePro': require('../../assets/fonts/SourceCodePro-Regular.ttf'),
  })

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />
  }

  return (
    <DatabaseProvider>
      <SettingsHydrator />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="analyzing" />
        <Stack.Screen name="bodymap" />
      </Stack>
    </DatabaseProvider>
  )
}
