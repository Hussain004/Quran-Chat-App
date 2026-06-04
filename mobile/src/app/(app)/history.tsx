import { View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { ConversationSkeleton } from '@/components/Skeleton'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'

type Conversation = {
  id: string
  title: string
  updated_at: string
}

type Section = {
  title: string
  data: Conversation[]
}

function groupByDate(convs: Conversation[]): Section[] {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000)

  const buckets: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  }

  for (const conv of convs) {
    const d = new Date(conv.updated_at)
    if (d >= todayStart) buckets['Today'].push(conv)
    else if (d >= yesterdayStart) buckets['Yesterday'].push(conv)
    else if (d >= weekStart) buckets['This Week'].push(conv)
    else buckets['Earlier'].push(conv)
  }

  return (Object.entries(buckets) as [string, Conversation[]][])
    .filter(([, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }))
}

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function HistoryScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top } = useSafeAreaInsets()
  const [sections, setSections] = useState<Section[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (data) setSections(groupByDate(data as Conversation[]))
    setInitialLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  function confirmDelete(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(
      'Delete Conversation',
      'This will permanently delete this conversation and all its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await supabase.from('messages').delete().eq('conversation_id', id)
            await supabase.from('conversations').delete().eq('id', id)
            setSections(prev =>
              prev
                .map(s => ({ ...s, data: s.data.filter(c => c.id !== id) }))
                .filter(s => s.data.length > 0)
            )
          },
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style={colors.statusBar} />
      <Text style={[styles.pageHeader, { paddingTop: top + 16 }]}>History</Text>

      {initialLoading ? (
        <View style={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => <ConversationSkeleton key={i} />)}
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={52} color={colors.textVeryFaint} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>Start one from the home screen</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
              onLongPress={() => confirmDelete(item.id)}
              activeOpacity={0.75}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardTime}>{formatTime(item.updated_at)}</Text>
              </View>
              <Text style={styles.cardArrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    pageHeader: { color: c.text, fontSize: 28, fontWeight: '700', padding: 24, paddingBottom: 8 },
    list: { paddingHorizontal: 24, paddingBottom: 40 },
    skeletonList: { paddingHorizontal: 24, paddingTop: 12 },

    sectionHeader: {
      color: c.textMuted, fontSize: 12, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 1.5,
      marginTop: 20, marginBottom: 10,
    },

    card: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 16, borderWidth: 1, borderColor: c.border,
      flexDirection: 'row', alignItems: 'center',
      marginBottom: 8,
    },
    cardContent: { flex: 1 },
    cardTitle: { color: c.text, fontSize: 15, fontWeight: '500', marginBottom: 4 },
    cardTime: { color: c.textFaint, fontSize: 12 },
    cardArrow: { color: c.textVeryFaint, fontSize: 22, marginLeft: 8 },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '600', marginTop: 4 },
    emptySubtitle: { color: c.textFaint, fontSize: 14 },
  })
}
