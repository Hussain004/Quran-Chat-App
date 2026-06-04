import { useState, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as Speech from 'expo-speech'
import { Ionicons } from '@expo/vector-icons'
import { VerseCard } from './VerseCard'
import { useTheme } from '@/context/ThemeContext'
import type { CitedVerse } from '@/lib/api'
import type { Colors } from '@/lib/theme'

type Props = {
  role: 'user' | 'assistant'
  content: string
  citedVerses?: CitedVerse[]
  lowConfidence?: boolean
  failed?: boolean
  onRetry?: () => void
}

export function MessageBubble({ role, content, citedVerses, lowConfidence, failed, onRetry }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const isUser = role === 'user'
  const [speaking, setSpeaking] = useState(false)

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Share.share({ message: content })
  }

  async function handleSpeak() {
    if (speaking) {
      Speech.stop()
      setSpeaking(false)
      return
    }
    // Strip verse citation brackets [Surah, X:Y] — they're visual markers, not for TTS
    const spoken = content.replace(/\[[^\]]+\]/g, '').trim()
    setSpeaking(true)
    Speech.speak(spoken, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      rate: 0.9,
    })
  }

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userMsgGroup}>
          <TouchableOpacity
            style={[styles.userBubble, failed && styles.userBubbleFailed]}
            onLongPress={handleLongPress}
            activeOpacity={0.85}
          >
            <Text style={styles.userText}>{content}</Text>
          </TouchableOpacity>
          {failed && (
            <TouchableOpacity style={styles.retryRow} onPress={onRetry}>
              <Ionicons name="refresh-outline" size={13} color={colors.errorText} />
              <Text style={styles.retryText}>Failed — tap to retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={14} color={colors.accent} />
      </View>
      <View style={styles.aiContent}>
        <TouchableOpacity style={styles.aiBubble} onLongPress={handleLongPress} activeOpacity={0.9}>
          <Text style={styles.aiText}>{content}</Text>
        </TouchableOpacity>

        <View style={styles.aiFooter}>
          {lowConfidence && (
            <View style={styles.lowConfidenceRow}>
              <Ionicons name="warning-outline" size={13} color={colors.warningText} />
              <Text style={styles.lowConfidenceNote}>Low confidence — consult a scholar for authoritative guidance.</Text>
            </View>
          )}
          <TouchableOpacity style={styles.speakBtn} onPress={handleSpeak}>
            <Ionicons
              name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
              size={16}
              color={speaking ? colors.accent : colors.textFaint}
            />
          </TouchableOpacity>
        </View>

        {citedVerses && citedVerses.length > 0 && (
          <VerseCard verses={citedVerses} />
        )}
      </View>
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 4 },
    userMsgGroup: { alignItems: 'flex-end', maxWidth: '80%' },
    userBubble: { backgroundColor: c.primary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
    userBubbleFailed: { backgroundColor: c.errorBg, borderColor: c.errorBorder, borderWidth: 1 },
    userText: { color: '#F8F4ED', fontSize: 15, lineHeight: 22 },
    retryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingHorizontal: 4 },
    retryText: { color: c.errorText, fontSize: 12 },

    aiRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 8, alignItems: 'flex-start' },
    aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentBg, justifyContent: 'center', alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: c.accentBorder },
    aiContent: { flex: 1 },
    aiBubble: { backgroundColor: c.surface, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: c.aiBubbleBorder },
    aiText: { color: c.text, fontSize: 15, lineHeight: 24 },

    aiFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingHorizontal: 4 },
    lowConfidenceRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    lowConfidenceNote: { color: c.warningText, fontSize: 12, flex: 1, opacity: 0.9 },
    speakBtn: { padding: 4, marginLeft: 'auto' },
  })
}
