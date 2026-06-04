import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { Text } from '@/lib/typography'
import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { MessageBubble } from '@/components/MessageBubble'
import { ConversationSkeleton } from '@/components/Skeleton'
import { listBookmarks, deleteBookmark, type Bookmark } from '@/lib/bookmarks'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'

export default function SavedScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top } = useSafeAreaInsets()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const data = await listBookmarks()
    setBookmarks(data)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { setLoading(true); load() }, [load]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  async function remove(b: Bookmark) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setBookmarks(prev => prev.filter(x => x.id !== b.id))
    try { await deleteBookmark(b.id) } catch { load() }
  }

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <StatusBar style={colors.statusBar} />
      <Text style={styles.pageHeader}>Saved</Text>

      {loading ? (
        <View style={styles.skeletonList}>
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
        </View>
      ) : bookmarks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={40} color={colors.textVeryFaint} />
          <Text style={styles.emptyTitle}>No saved answers yet</Text>
          <Text style={styles.emptyHint}>Tap Save under any answer to keep it here for later.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {bookmarks.map(b => (
            <View key={b.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.date}>{formatDate(b.created_at)}</Text>
                <TouchableOpacity onPress={() => remove(b)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                </TouchableOpacity>
              </View>
              <MessageBubble role="assistant" content={b.content} citedVerses={b.cited_verses ?? undefined} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    pageHeader: { color: c.text, fontSize: 28, fontFamily: 'Fraunces', padding: 24, paddingBottom: 8 },
    skeletonList: { paddingHorizontal: 24, paddingTop: 12 },
    list: { paddingBottom: 40, paddingTop: 4 },
    card: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.borderFaint },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
    date: { color: c.textFaint, fontSize: 12 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10, marginTop: -40 },
    emptyTitle: { color: c.textSecondary, fontSize: 17, fontWeight: '600' },
    emptyHint: { color: c.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  })
}
