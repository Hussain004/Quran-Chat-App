import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function WelcomeScreen() {
  const { top, bottom } = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingTop: top + 24, paddingBottom: bottom + 24 }]}>
      <StatusBar style="light" />

      <View style={styles.top}>
        <Text style={styles.bismillah}>بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</Text>
        <Text style={styles.title}>Qur'an Chat</Text>
        <Text style={styles.subtitle}>Ask anything about the Holy Qur'an and receive answers grounded in its verses.</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.secondaryBtnText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A4731', justifyContent: 'space-between', paddingHorizontal: 32 },
  top: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  bismillah: { color: '#C9A84C', fontSize: 32, textAlign: 'center', marginBottom: 8, fontFamily: 'NoorHira', lineHeight: 56, writingDirection: 'rtl' },
  title: { color: '#F8F4ED', fontSize: 36, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#F8F4ED', fontSize: 16, textAlign: 'center', opacity: 0.8, lineHeight: 24 },
  buttons: { gap: 12 },
  primaryBtn: { backgroundColor: '#C9A84C', borderRadius: 14, padding: 18, alignItems: 'center' },
  primaryBtnText: { color: '#1A4731', fontSize: 17, fontWeight: '700' },
  secondaryBtn: { borderRadius: 14, padding: 18, alignItems: 'center' },
  secondaryBtnText: { color: '#F8F4ED', fontSize: 16 },
})
