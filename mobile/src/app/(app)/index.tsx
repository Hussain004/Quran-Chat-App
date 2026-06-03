import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'

const SUGGESTED_QUESTIONS = [
  "What does the Quran say about patience?",
  "Verses about gratitude and giving thanks",
  "What is the importance of prayer?",
  "The Quran on forgiveness and mercy",
  "What does the Quran say about kindness to parents?",
  "Verses about trust in Allah",
  "What does the Quran say about the afterlife?",
  "The Quran on seeking knowledge",
]

export default function HomeScreen() {
  const [conversations, setConversations] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadConversations(user.id)
      }
    })
  }, [])

  async function loadConversations(uid: string) {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(3)
    if (data) setConversations(data)
  }

  async function startNewConversation(initialMessage?: string) {
    if (!userId) return
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title: 'New Conversation' })
      .select()
      .single()
    if (error || !data) return
    router.push({ pathname: '/chat/[id]', params: { id: data.id, initialMessage: initialMessage ?? '' } })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.bismillah}>بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</Text>
        <Text style={styles.title}>Qur'an Chat</Text>
        <Text style={styles.subtitle}>What would you like to know?</Text>
      </View>

      <TouchableOpacity style={styles.newChatBtn} onPress={() => startNewConversation()}>
        <Text style={styles.newChatIcon}>✦</Text>
        <Text style={styles.newChatText}>New Conversation</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Suggested Questions</Text>
      <View style={styles.chips}>
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <TouchableOpacity key={i} style={styles.chip} onPress={() => startNewConversation(q)}>
            <Text style={styles.chipText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {conversations.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Recent</Text>
          {conversations.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={styles.convCard}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id } })}
            >
              <Text style={styles.convTitle}>{conv.title}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14' },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 16 },
  header: { alignItems: 'center', marginBottom: 8, gap: 8 },
  bismillah: { color: '#C9A84C', fontSize: 22, textAlign: 'center' },
  title: { color: '#F8F4ED', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#F8F4ED', opacity: 0.6, fontSize: 15 },
  newChatBtn: { backgroundColor: '#1A4731', borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#2D6A4F' },
  newChatIcon: { color: '#C9A84C', fontSize: 18 },
  newChatText: { color: '#F8F4ED', fontSize: 16, fontWeight: '600' },
  sectionLabel: { color: '#F8F4ED', opacity: 0.5, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#152B1F', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2D4A38' },
  chipText: { color: '#F8F4ED', fontSize: 13 },
  convCard: { backgroundColor: '#152B1F', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2D4A38' },
  convTitle: { color: '#F8F4ED', fontSize: 15, fontWeight: '500' },
})
