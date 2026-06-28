import '../global.css'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SQLiteProvider } from 'expo-sqlite'
import { initDatabase } from '@/lib/db/queries'
import { seedDemoData } from '@/lib/db/seed'

async function onDatabaseInit(db: Parameters<typeof initDatabase>[0]) {
  await initDatabase(db)
  await seedDemoData(db)
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'MOMCAKE-Bold': require('../../assets/fonts/MOMCAKE-Bold.otf'),
    'MOMCAKE-Thin': require('../../assets/fonts/MOMCAKE-Thin.otf'),
    'BourbonGrotesque': require('../../assets/fonts/BourbonGrotesque-Regular.otf'),
    'BarlowCondensed-Regular': require('@expo-google-fonts/barlow-condensed/400Regular/BarlowCondensed_400Regular.ttf'),
    'BarlowCondensed-SemiBold': require('@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf'),
    'BarlowCondensed-Bold': require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
    'SourceCodePro': require('@expo-google-fonts/source-code-pro/400Regular/SourceCodePro_400Regular.ttf'),
  })

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />
  }

  return (
    <SQLiteProvider databaseName="maigenki.db" onInit={onDatabaseInit}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="analyzing" />
        <Stack.Screen name="bodymap" />
      </Stack>
    </SQLiteProvider>
  )
}
