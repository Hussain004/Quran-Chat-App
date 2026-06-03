import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export default function SettingsScreen() {
  const { top } = useSafeAreaInsets()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setDisplayName(user.user_metadata?.display_name ?? '')
      }
    })
  }, [])

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={[styles.header, { paddingTop: top + 16 }]}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          {displayName ? <Text style={styles.name}>{displayName}</Text> : null}
          <Text style={styles.email}>{email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <Text style={styles.about}>
            Qur'an Chat uses Retrieval-Augmented Generation (RAG) to ensure every answer is grounded in verified Qur'anic verses. No hallucination, ever.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14', padding: 24 },
  header: { color: '#F8F4ED', fontSize: 28, fontWeight: '700', marginBottom: 32 },
  section: { marginBottom: 24, gap: 8 },
  sectionLabel: { color: '#F8F4ED', opacity: 0.5, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#152B1F', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2D4A38', gap: 4 },
  name: { color: '#F8F4ED', fontSize: 17, fontWeight: '600' },
  email: { color: '#F8F4ED', opacity: 0.6, fontSize: 14 },
  about: { color: '#F8F4ED', opacity: 0.8, fontSize: 14, lineHeight: 22 },
  signOutBtn: { marginTop: 'auto', backgroundColor: '#3B1212', borderRadius: 12, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#6B2121' },
  signOutText: { color: '#FF6B6B', fontSize: 16, fontWeight: '600' },
})
