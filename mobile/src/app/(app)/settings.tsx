import { View, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native'
import { Text } from '@/lib/typography'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { enableDailyReminder, disableDailyReminder, isDailyReminderOn } from '@/lib/notifications'
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage, LANGUAGE_LABELS, type AppLanguage } from '@/context/LanguageContext'
import type { Colors } from '@/lib/theme'

const LANGUAGES: AppLanguage[] = ['en', 'ur', 'ar']

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top } = useSafeAreaInsets()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [reminderOn, setReminderOn] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setDisplayName(user.user_metadata?.display_name ?? '')
      }
    })
  }, [])

  useEffect(() => { isDailyReminderOn().then(setReminderOn) }, [])

  async function handleToggleReminder(value: boolean) {
    if (value) {
      const ok = await enableDailyReminder()
      if (!ok) {
        Alert.alert('Notifications off', 'Enable notifications in your device settings to get a daily reminder.')
        return
      }
      setReminderOn(true)
    } else {
      await disableDailyReminder()
      setReminderOn(false)
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  return (
    <View style={[styles.container, { paddingTop: top + 16 }]}>
      <StatusBar style={colors.statusBar} />
      <Text style={styles.header}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          {displayName ? <Text style={styles.name}>{displayName}</Text> : null}
          <Text style={styles.email}>{email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={isDark ? colors.bg : colors.surface}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Daily verse reminder</Text>
            <Switch
              value={reminderOn}
              onValueChange={handleToggleReminder}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={reminderOn ? colors.bg : colors.surface}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Response Language</Text>
        <View style={styles.card}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang}
              style={[styles.langRow, lang !== LANGUAGES[LANGUAGES.length - 1] && styles.langRowBorder]}
              onPress={() => setLanguage(lang)}
              activeOpacity={0.7}
            >
              <Text style={styles.langLabel}>{LANGUAGE_LABELS[lang]}</Text>
              {language === lang && (
                <Text style={styles.langCheck}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
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

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, padding: 24 },
    header: { color: c.text, fontSize: 28, fontFamily: 'Fraunces', marginBottom: 32 },
    section: { marginBottom: 24, gap: 8 },
    sectionLabel: { color: c.text, opacity: 0.5, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    card: { backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: c.border },
    name: { color: c.text, fontSize: 17, fontWeight: '600', paddingVertical: 12 },
    email: { color: c.text, opacity: 0.6, fontSize: 14, paddingVertical: 12 },
    about: { color: c.text, opacity: 0.8, fontSize: 14, lineHeight: 22, paddingVertical: 12 },

    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    rowLabel: { color: c.text, fontSize: 15 },

    langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    langRowBorder: { borderBottomWidth: 1, borderBottomColor: c.borderFaint },
    langLabel: { flex: 1, color: c.text, fontSize: 15 },
    langCheck: { color: c.accent, fontSize: 16, fontWeight: '700' },

    signOutBtn: { marginTop: 'auto', backgroundColor: c.signOutBg, borderRadius: 12, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: c.signOutBorder },
    signOutText: { color: c.signOutText, fontSize: 16, fontWeight: '600' },
  })
}
