import '@/i18n'
import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '@/state/session'
import { ToastProvider } from '@/state/toast'
import { colors, fonts } from '@/theme/tokens'

void SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({
    [fonts.thin]: require('../../assets/fonts/Urbanist_200ExtraLight_Italic.ttf'),
    [fonts.light]: require('../../assets/fonts/Urbanist_300Light_Italic.ttf'),
    [fonts.italic]: require('../../assets/fonts/Urbanist_400Regular_Italic.ttf'),
    [fonts.regular]: require('../../assets/fonts/Urbanist_400Regular.ttf'),
    [fonts.medium]: require('../../assets/fonts/Urbanist_500Medium.ttf'),
  })
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Browser surfaces carry the palette too: selection, caret, scrollbars, focus ring.
      const style = document.createElement('style')
      style.textContent = `::selection{background:rgba(50,116,240,.18)}*{scrollbar-width:thin;scrollbar-color:${colors.line2} transparent}:focus-visible{outline:1.5px solid ${colors.ink};outline-offset:2px}input,textarea{caret-color:${colors.blue};outline:none}body{background:${colors.ground};font-variant-numeric:tabular-nums}`
      document.head.appendChild(style)
    }
  }, [])
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: colors.ground }} />
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Routes />
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  )
}

function Routes() {
  const { ready, session } = useSession()
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {})
  }, [ready])
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.ground }} />
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
      <Stack.Protected guard={!!session} redirectTo="/connect">
        <Stack.Screen name="(main)" />
        <Stack.Screen name="ask" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="setup" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session} redirectTo="/">
        <Stack.Screen name="connect" />
      </Stack.Protected>
    </Stack>
  )
}
