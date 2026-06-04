import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Alert, Keyboard
} from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '@/lib/typography'
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
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import type { Colors } from '@/lib/theme'

type ChatMessage = Message & {
  id: string
  citedVerses?: CitedVerse[]
  lowConfidence?: boolean
  failed?: boolean
}

type TypingItem = { id: string; role: 'typing'; content: string }
type ListItem = ChatMessage | TypingItem

const MAX_CHARS = 500

export default function ChatScreen() {
  const { colors } = useTheme()
  const { language } = useLanguage()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top, bottom } = useSafeAreaInsets()
  const { id, initialMessage } = useLocalSearchParams<{ id: string; initialMessage?: string }>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('New Conversation')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<any>(null)
  const isFirstMessage = useRef(true)
  const inputRef = useRef<RNTextInput>(null)

  useEffect(() => {
    loadMessages()
  }, [id])

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
      const { reply, citedVerses, lowConfidence } = await sendMessage(text, history, language)

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

      if (savedUser && savedAi) {
        setMessages(prev => prev.map(m => {
          if (m.id === userMsg.id) return { ...m, id: savedUser.id }
          if (m.id === aiMsg.id) return { ...m, id: savedAi.id }
          return m
        }))
      }

      await supabase.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', id)

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
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <StatusBar style={colors.statusBar} />

      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlashList
        ref={listRef}
        data={[...messages, ...(loading ? [{ id: '__typing__', role: 'typing' as const, content: '' }] : [])] as ListItem[]}
        keyExtractor={(item: ListItem) => item.id}
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
        renderItem={({ item }: { item: ListItem }) => {
          if (item.role === 'typing') return <TypingIndicator />
          const msg = item as ChatMessage
          return (
            <MessageBubble
              role={msg.role as 'user' | 'assistant'}
              content={msg.content}
              citedVerses={msg.citedVerses}
              lowConfidence={msg.lowConfidence}
              failed={msg.failed}
              onRetry={() => retryMessage(msg)}
            />
          )
        }}
      />

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
            placeholderTextColor={colors.placeholder}
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
            <Ionicons
              name="arrow-up"
              size={20}
              color={(!input.trim() || loading) ? colors.sendIconDisabled : colors.sendIconActive}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.borderFaint,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    headerTitle: { flex: 1, color: c.text, fontSize: 16, fontWeight: '600', textAlign: 'center', marginHorizontal: 8 },

    listContent: { paddingVertical: 16 },

    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyArabic: { color: c.accent, fontSize: 26, textAlign: 'center', fontFamily: 'NoorHira', lineHeight: 48, writingDirection: 'rtl' },
    emptyText: { color: c.textFaint, fontSize: 15 },

    inputBar: { borderTopWidth: 1, borderTopColor: c.borderFaint, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.bg },
    counter: { color: c.textFaint, fontSize: 12, textAlign: 'right', marginBottom: 4 },
    counterRed: { color: '#EF4444' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
      flex: 1, backgroundColor: c.inputBg, color: c.text, fontFamily: 'Jakarta',
      borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12,
      fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: c.border,
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { backgroundColor: c.border },
  })
}
