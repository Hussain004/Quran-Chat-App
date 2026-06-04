import { useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { View, ActivityIndicator, I18nManager, StyleSheet } from 'react-native'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { useAuth } from '@/hooks/use-auth'
import { ThemeProvider, useTheme } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'

// Keep Arabic text from flipping the whole layout to RTL
I18nManager.allowRTL(false)

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <RootContent />
      </LanguageProvider>
    </ThemeProvider>
  )
}

function RootContent() {
  const { colors } = useTheme()
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
    const inAppGroup = segments[0] === '(app)'
    const inChatGroup = segments[0] === 'chat'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (session && !inAppGroup && !inChatGroup) {
      router.replace('/(app)')
    }
  }, [session, segments, loading])

  if (loading || !fontsLoaded) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="chat/[id]" options={{ presentation: 'card' }} />
      </Stack>
    </View>
  )
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  root: { flex: 1 },
})
