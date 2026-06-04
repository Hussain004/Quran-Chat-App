import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Text } from '@/lib/typography'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useState, useCallback, useMemo } from 'react'
import { ConversationSkeleton } from '@/components/Skeleton'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'

const SUGGESTED_QUESTIONS = [
  "What does the Quran say about patience?",
  "What is the importance of prayer?",
  "The Quran on forgiveness and mercy",
  "The Quran on seeking knowledge",
]

export default function HomeScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [conversations, setConversations] = useState<any[]>([])
  const [displayName, setDisplayName] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [recentsLoading, setRecentsLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: profile }, { data: convs }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase.from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(3),
    ])

    if (profile?.display_name) setDisplayName(profile.display_name)
    if (convs) setConversations(convs)
    setRecentsLoading(false)
  }, [])

  useFocusEffect(useCallback(() => {
    setRecentsLoading(true)
    loadData()
  }, [loadData]))

  async function startNewConversation(initialMessage?: string) {
    if (!userId || creating) return
    setCreating(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title: 'New Conversation' })
      .select()
      .single()
    setCreating(false)
    if (error || !data) return
    router.push({ pathname: '/chat/[id]', params: { id: data.id, initialMessage: initialMessage ?? '' } })
  }

  const { top } = useSafeAreaInsets()
  const firstName = displayName.split(' ')[0]

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: top + 20 }]} showsVerticalScrollIndicator={false}>
      <StatusBar style={colors.statusBar} />

      <View style={styles.header}>
        <Text style={styles.bismillah}>بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</Text>
        <Text style={styles.greeting}>
          {firstName ? `Assalamu Alaikum, ${firstName}` : 'Assalamu Alaikum'}
        </Text>
        <Text style={styles.subtitle}>What would you like to know?</Text>
      </View>

      <TouchableOpacity
        style={[styles.newChatBtn, creating && styles.newChatBtnDisabled]}
        onPress={() => startNewConversation()}
        activeOpacity={0.8}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
        )}
        <Text style={styles.newChatText}>New Conversation</Text>
        {!creating && <Ionicons name="chevron-forward" size={20} color={colors.accent} />}
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Explore Topics</Text>
      <View style={styles.chips}>
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <TouchableOpacity key={i} style={styles.chip} onPress={() => startNewConversation(q)} activeOpacity={0.75} disabled={creating}>
            <Text style={styles.chipText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.recentSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Recent</Text>
          {!recentsLoading && conversations.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentsLoading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : conversations.length === 0 ? (
          <Text style={styles.noRecents}>No conversations yet, start one above</Text>
        ) : (
          conversations.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={styles.convCard}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id } })}
              activeOpacity={0.75}
            >
              <View style={styles.convCardInner}>
                <Text style={styles.convTitle} numberOfLines={1}>{conv.title}</Text>
                <Text style={styles.convTime}>{formatRelative(conv.updated_at)}</Text>
              </View>
              <Text style={styles.convArrow}>›</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  )
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 24, paddingBottom: 48 },

    header: { alignItems: 'center', marginBottom: 28 },
    bismillah: { color: c.accent, fontSize: 26, textAlign: 'center', marginBottom: 10, fontFamily: 'NoorHira', lineHeight: 48, writingDirection: 'rtl' },
    greeting: { color: c.text, fontSize: 26, fontFamily: 'Fraunces', textAlign: 'center', marginBottom: 6 },
    subtitle: { color: c.textMuted, fontSize: 15 },

    newChatBtn: {
      backgroundColor: c.primary, borderRadius: 16, padding: 18,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: c.primaryBorder, marginBottom: 28,
    },
    newChatBtnDisabled: { opacity: 0.65 },
    newChatText: { flex: 1, color: '#F8F4ED', fontSize: 16, fontWeight: '600' },

    sectionLabel: {
      color: c.textMuted, fontSize: 12, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12,
    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: {
      backgroundColor: c.surface, borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: c.border,
    },
    chipText: { color: c.textSecondary, fontSize: 13 },

    recentSection: { marginTop: 24 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    seeAll: { color: c.accent, fontSize: 13 },
    noRecents: { color: c.textVeryFaint, fontSize: 14, textAlign: 'center', paddingVertical: 16 },

    convCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border,
      flexDirection: 'row', alignItems: 'center',
      marginBottom: 10,
    },
    convCardInner: { flex: 1 },
    convTitle: { color: c.text, fontSize: 15, fontWeight: '500', marginBottom: 4 },
    convTime: { color: c.textFaint, fontSize: 12 },
    convArrow: { color: c.textVeryFaint, fontSize: 22, marginLeft: 8 },
  })
}
