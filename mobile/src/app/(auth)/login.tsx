import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '@/lib/supabase'

export default function LoginScreen() {
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />

      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14', padding: 32, justifyContent: 'center' },
  back: { position: 'absolute', top: 56, left: 24 },
  backText: { color: '#C9A84C', fontSize: 16 },
  title: { color: '#F8F4ED', fontSize: 32, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#F8F4ED', opacity: 0.6, fontSize: 16, marginBottom: 40 },
  form: { gap: 16, marginBottom: 32 },
  input: { backgroundColor: '#152B1F', color: '#F8F4ED', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#2D4A38' },
  btn: { backgroundColor: '#C9A84C', borderRadius: 12, padding: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#1A4731', fontSize: 17, fontWeight: '700' },
  link: { color: '#C9A84C', textAlign: 'center', fontSize: 15 },
})
