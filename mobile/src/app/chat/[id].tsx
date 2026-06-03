import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Text, Alert, Keyboard
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { sendMessage, generateTitle, type Message, type CitedVerse } from '@/lib/api'
import { MessageBubble } from '@/components/MessageBubble'
import { TypingIndicator } from '@/components/TypingIndicator'

type ChatMessage = Message & {
  id: string
  citedVerses?: CitedVerse[]
  lowConfidence?: boolean
  failed?: boolean
}

const MAX_CHARS = 500

export default function ChatScreen() {
  const { top, bottom } = useSafeAreaInsets()
  const { id, initialMessage } = useLocalSearchParams<{ id: string; initialMessage?: string }>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('New Conversation')
  const listRef = useRef<FlashList<any>>(null)
  const isFirstMessage = useRef(true)
  const inputRef = useRef<TextInput>(null)

  // Load existing messages
  useEffect(() => {
    loadMessages()
  }, [id])

  // Auto-send if coming from a suggested question
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      setInput(initialMessage as string)
    }
  }, [initialMessage])

  async function loadMessages() {
    const { data: conv } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', id)
      .single()
    if (conv) {
      setTitle(conv.title)
      isFirstMessage.current = conv.title === 'New Conversation'
    }

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      setMessages(data.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citedVerses: m.cited_verses ?? [],
        lowConfidence: false,
      })))
      isFirstMessage.current = false
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return

    setInput('')
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    scrollToBottom()

    const history = messages.filter(m => !m.failed).map(m => ({ role: m.role, content: m.content }))

    try {
      const { reply, citedVerses, lowConfidence } = await sendMessage(text, history)

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      const aiMsg: ChatMessage = {
        id: `temp-ai-${Date.now()}`,
        role: 'assistant',
        content: reply,
        citedVerses,
        lowConfidence,
      }
      setMessages(prev => [...prev, aiMsg])
      scrollToBottom()

      // Save both messages to Supabase
      const { data: savedUser } = await supabase.from('messages').insert({
        conversation_id: id,
        role: 'user',
        content: text,
      }).select().single()

      const { data: savedAi } = await supabase.from('messages').insert({
        conversation_id: id,
        role: 'assistant',
        content: reply,
        cited_verses: citedVerses,
      }).select().single()

      // Replace temp IDs with real ones
      if (savedUser && savedAi) {
        setMessages(prev => prev.map(m => {
          if (m.id === userMsg.id) return { ...m, id: savedUser.id }
          if (m.id === aiMsg.id) return { ...m, id: savedAi.id }
          return m
        }))
      }

      // Update conversation timestamp
      await supabase.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id)

      // Auto-generate title on first message
      if (isFirstMessage.current) {
        isFirstMessage.current = false
        const newTitle = await generateTitle(text)
        setTitle(newTitle)
        await supabase.from('conversations')
          .update({ title: newTitle })
          .eq('id', id)
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setMessages(prev => prev.map(m => m.id === userMsg.id ? { ...m, failed: true } : m))
    } finally {
      setLoading(false)
    }
  }

  function retryMessage(failedMsg: ChatMessage) {
    setMessages(prev => prev.filter(m => m.id !== failedMsg.id))
    setTimeout(() => handleSend(failedMsg.content), 0)
  }

  const charsLeft = MAX_CHARS - input.length
  const showCounter = charsLeft <= 100

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Messages */}
      <FlashList
        ref={listRef}
        data={[...messages, ...(loading ? [{ id: '__typing__', role: 'typing', content: '' }] : [])]}
        keyExtractor={item => item.id}
        estimatedItemSize={100}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToBottom}
        onScrollBeginDrag={Keyboard.dismiss}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyArabic}>بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</Text>
              <Text style={styles.emptyText}>Ask anything about the Qur'an</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.role === 'typing') return <TypingIndicator />
          return (
            <MessageBubble
              role={item.role as 'user' | 'assistant'}
              content={item.content}
              citedVerses={item.citedVerses}
              lowConfidence={item.lowConfidence}
              failed={item.failed}
              onRetry={() => retryMessage(item)}
            />
          )
        }}
      />

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(bottom, 10) }]}>
        {showCounter && (
          <Text style={[styles.counter, charsLeft < 20 && styles.counterRed]}>
            {charsLeft}
          </Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={text => setInput(text.slice(0, MAX_CHARS))}
            placeholder="Ask about the Qur'an…"
            placeholderTextColor="#4B6858"
            multiline
            maxLength={MAX_CHARS}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="arrow-up" size={20} color="#1A4731" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E3525',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#F8F4ED', fontSize: 16, fontWeight: '600', textAlign: 'center', marginHorizontal: 8 },

  listContent: { paddingVertical: 16 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyArabic: { color: '#C9A84C', fontSize: 26, textAlign: 'center', fontFamily: 'NoorHira', lineHeight: 48, writingDirection: 'rtl' },
  emptyText: { color: '#6B7280', fontSize: 15 },

  inputBar: { borderTopWidth: 1, borderTopColor: '#1E3525', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0D1B14' },
  counter: { color: '#6B7280', fontSize: 12, textAlign: 'right', marginBottom: 4 },
  counterRed: { color: '#EF4444' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#152B1F', color: '#F8F4ED',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: '#2D4A38',
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C9A84C', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#2D4A38' },
})
