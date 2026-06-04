import { useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { View, ActivityIndicator, I18nManager, Platform, StyleSheet } from 'react-native'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { useAuth } from '@/hooks/use-auth'

// Keep Arabic text from flipping the whole layout to RTL
I18nManager.allowRTL(false)

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const [fontsLoaded] = useFonts({
    NoorHira: require('../../assets/fonts/NoorHira.ttf'),
  })

  useEffect(() => {
    // Set the Android Activity window background so no white/grey shows
    // through any layout gap (keyboard, nav bar, transitions)
    SystemUI.setBackgroundColorAsync('#0D1B14').catch(() => {})
    if (Platform.OS !== 'android') return
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NavBar = require('expo-navigation-bar')
        await NavBar.setBackgroundColorAsync('#0D1B14')
        await NavBar.setButtonStyleAsync('light')
      } catch {}
    })()
  }, [])

  useEffect(() => {
    if (!loading && fontsLoaded) SplashScreen.hideAsync()
  }, [loading, fontsLoaded])

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const inAppGroup = segments[0] === '(app)'
    const inChatGroup = segments[0] === 'chat'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (session && !inAppGroup && !inChatGroup) {
      // covers: arriving from auth screens OR from root index on relaunch
      router.replace('/(app)')
    }
  }, [session, segments, loading])

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D1B14' }}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="chat/[id]" options={{ presentation: 'card' }} />
      </Stack>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1B14' },
})
