import { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'

export default function LoginScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top, bottom } = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return Alert.alert('Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) Alert.alert('Login failed', error.message)
  }

  return (
    <View style={styles.container}>
      <StatusBar style={colors.statusBar} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: top + 24, paddingBottom: bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.placeholder}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.replace('/(auth)/register')}>
          <Text style={styles.link}>Don't have an account? Register</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { flexGrow: 1, padding: 32, justifyContent: 'center' },
    back: { marginBottom: 32 },
    backText: { color: c.accent, fontSize: 16 },
    title: { color: c.text, fontSize: 32, fontWeight: '700', marginBottom: 8 },
    subtitle: { color: c.text, opacity: 0.6, fontSize: 16, marginBottom: 40 },
    form: { gap: 16, marginBottom: 32 },
    input: { backgroundColor: c.inputBg, color: c.text, borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: c.border },
    btn: { backgroundColor: c.accent, borderRadius: 12, padding: 18, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: c.primary, fontSize: 17, fontWeight: '700' },
    link: { color: c.accent, textAlign: 'center', fontSize: 15 },
  })
}
