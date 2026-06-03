import { useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { View, ActivityIndicator, I18nManager } from 'react-native'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
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
    if (!loading && fontsLoaded) SplashScreen.hideAsync()
  }, [loading, fontsLoaded])

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (session && inAuthGroup) {
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="chat/[id]" options={{ presentation: 'card' }} />
    </Stack>
  )
}
