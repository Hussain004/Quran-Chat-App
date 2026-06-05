import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, TouchableOpacity, StyleSheet, Platform,
  KeyboardAvoidingView, Alert, Keyboard, ScrollView, ActivityIndicator
} from 'react-native'
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio'
import type { TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '@/lib/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { sendMessage, sendMessageStreaming, generateTitle, transcribeAudio, type Message, type CitedVerse } from '@/lib/api'
import { addBookmark, removeBookmark, getBookmarkedMessageIds } from '@/lib/bookmarks'
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
  followUps?: string[]
}

type TypingItem = { id: string; role: 'typing'; content: string }
type StreamingItem = { id: string; role: 'streaming'; content: string }
type ListItem = ChatMessage | TypingItem | StreamingItem

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
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<any>(null)
  const isFirstMessage = useRef(true)
  const inputRef = useRef<RNTextInput>(null)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [streamingText, setStreamingText] = useState('')

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
        followUps: m.follow_ups ?? undefined,
      })))
      isFirstMessage.current = false
      const assistantIds = data.filter(m => m.role === 'assistant').map(m => m.id)
      getBookmarkedMessageIds(assistantIds).then(setBookmarkedIds).catch(() => {})
    }
  }

  async function toggleBookmark(msg: ChatMessage) {
    if (!msg.id || msg.id.startsWith('temp')) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const isSaved = bookmarkedIds.has(msg.id)
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (isSaved) next.delete(msg.id); else next.add(msg.id)
      return next
    })
    try {
      if (isSaved) await removeBookmark(msg.id)
      else await addBookmark(msg.id, msg.content, msg.citedVerses)
    } catch {
      setBookmarkedIds(prev => {
        const next = new Set(prev)
        if (isSaved) next.add(msg.id); else next.delete(msg.id)
        return next
      })
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  // Scroll to the newest message only when the message count changes (a new
  // turn), not when an existing bubble grows, e.g. expanding a tafseer dropdown.
  useEffect(() => {
    if (messages.length > 0) scrollToBottom()
  }, [messages.length, scrollToBottom])

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
    setStreamingText('')

    const history = messages.filter(m => !m.failed).map(m => ({ role: m.role, content: m.content }))

    try {
      let reply: string
      let citedVerses: CitedVerse[]
      let lowConfidence: boolean
      let followUps: string[] | undefined

      try {
        const result = await sendMessageStreaming(text, history, language, (chunk) => {
          setStreamingText(prev => prev + chunk)
          listRef.current?.scrollToEnd({ animated: false })
        })
        ;({ reply, citedVerses, lowConfidence, followUps } = result)
      } catch {
        // Streaming failed; fall back to non-streaming and show typing indicator
        setStreamingText('')
        const result = await sendMessage(text, history, language)
        ;({ reply, citedVerses, lowConfidence, followUps } = result)
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setStreamingText('')

      const aiMsg: ChatMessage = {
        id: `temp-ai-${Date.now()}`,
        role: 'assistant',
        content: reply,
        citedVerses,
        lowConfidence,
        followUps,
      }
      setMessages(prev => [...prev, aiMsg])

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

      // Persist follow-ups so they survive reopening the chat. Best-effort: if
      // the follow_ups column has not been added yet, this no-ops harmlessly.
      if (savedAi && followUps && followUps.length > 0) {
        try {
          await supabase.from('messages').update({ follow_ups: followUps }).eq('id', savedAi.id)
        } catch { /* column may not exist yet; non-critical */ }
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
      setStreamingText('')
      setMessages(prev => prev.map(m => m.id === userMsg.id ? { ...m, failed: true } : m))
    } finally {
      setLoading(false)
    }
  }

  function retryMessage(failedMsg: ChatMessage) {
    setMessages(prev => prev.filter(m => m.id !== failedMsg.id))
    setTimeout(() => handleSend(failedMsg.content), 0)
  }

  async function startRecording() {
    try {
      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Microphone off', 'Enable microphone access in your device settings to use voice input.')
        return
      }
      await recorder.prepareToRecordAsync()
      recorder.record()
      setRecording(true)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {
      setRecording(false)
    }
  }

  async function stopRecordingAndTranscribe() {
    setRecording(false)
    setTranscribing(true)
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) return
      const text = await transcribeAudio(uri, language)
      if (text) setInput(prev => (prev ? `${prev} ${text}` : text).slice(0, MAX_CHARS))
    } catch {
      Alert.alert('Could not transcribe', 'Please try again.')
    } finally {
      setTranscribing(false)
    }
  }

  function handleMicPress() {
    if (transcribing) return
    if (recording) stopRecordingAndTranscribe()
    else startRecording()
  }

  const charsLeft = MAX_CHARS - input.length
  const showCounter = charsLeft <= 100
  const lastMsg = messages[messages.length - 1]
  const suggestions = !loading && lastMsg?.role === 'assistant' ? lastMsg.followUps : undefined

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={colors.statusBar} />

      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.listWrap}>
      <FlashList
        ref={listRef}
        data={[
          ...messages,
          ...(loading && streamingText ? [{ id: '__streaming__', role: 'streaming' as const, content: streamingText }] : []),
          ...(loading && !streamingText ? [{ id: '__typing__', role: 'typing' as const, content: '' }] : []),
        ] as ListItem[]}
        keyExtractor={(item: ListItem) => item.id}
        contentContainerStyle={styles.listContent}
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
          if (item.role === 'streaming') return (
            <MessageBubble role="assistant" content={item.content} citedVerses={[]} />
          )
          const msg = item as ChatMessage
          return (
            <MessageBubble
              role={msg.role as 'user' | 'assistant'}
              content={msg.content}
              citedVerses={msg.citedVerses}
              lowConfidence={msg.lowConfidence}
              failed={msg.failed}
              onRetry={() => retryMessage(msg)}
              bookmarked={bookmarkedIds.has(msg.id)}
              onToggleBookmark={msg.role === 'assistant' && !msg.id.startsWith('temp') ? () => toggleBookmark(msg) : undefined}
            />
          )
        }}
      />
      </View>

      {suggestions && suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.followUpScroll}
          contentContainerStyle={styles.followUpRow}
        >
          {suggestions.map((q, i) => (
            <TouchableOpacity key={i} style={styles.followChip} onPress={() => handleSend(q)} activeOpacity={0.8}>
              <Ionicons name="sparkles-outline" size={12} color={colors.accent} />
              <Text style={styles.followChipText} numberOfLines={1}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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
            placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : "Ask about the Qur'an…"}
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={MAX_CHARS}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.micBtn, recording && styles.micBtnActive]}
            onPress={handleMicPress}
            disabled={transcribing}
          >
            {transcribing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name={recording ? 'stop' : 'mic-outline'} size={20} color={recording ? '#EF4444' : colors.textFaint} />
            )}
          </TouchableOpacity>
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
    listWrap: { flex: 1 },

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
    micBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    micBtnActive: { backgroundColor: c.errorBg },

    followUpScroll: { flexGrow: 0 },
    followUpRow: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
    followChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, paddingLeft: 12, paddingRight: 14, paddingVertical: 8, marginRight: 8, maxWidth: 260 },
    followChipText: { color: c.textSecondary, fontSize: 13, flexShrink: 1 },
  })
}
