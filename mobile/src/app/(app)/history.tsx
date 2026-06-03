import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'

export default function HistoryScreen() {
  const [conversations, setConversations] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (data) setConversations(data)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.header}>History</Text>
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
        ListEmptyComponent={
          <Text style={styles.empty}>No conversations yet. Start one from the home screen.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardTime}>
              {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14' },
  header: { color: '#F8F4ED', fontSize: 28, fontWeight: '700', padding: 24, paddingTop: 64 },
  list: { padding: 24, paddingTop: 0, gap: 12 },
  card: { backgroundColor: '#152B1F', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2D4A38' },
  cardTitle: { color: '#F8F4ED', fontSize: 15, fontWeight: '500', marginBottom: 4 },
  cardTime: { color: '#6B7280', fontSize: 13 },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 60, fontSize: 15 },
})
