import { useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '@/hooks/use-auth'

export default function RootLayout() {
  const { session, loading } = useAuth()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (session && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [session, segments, loading])

  if (loading) {
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
