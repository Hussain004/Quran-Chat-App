import { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'

export default function RegisterScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top, bottom } = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!name || !email || !password) return Alert.alert('Please fill in all fields')
    if (password.length < 6) return Alert.alert('Password must be at least 6 characters')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })
    setLoading(false)
    if (error) Alert.alert('Registration failed', error.message)
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

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start your journey with the Qur'an</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={setName}
          />
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
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleRegister} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
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
