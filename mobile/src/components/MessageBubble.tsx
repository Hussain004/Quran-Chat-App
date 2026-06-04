import { useState, useMemo } from 'react'
import { View, TouchableOpacity, StyleSheet, Share } from 'react-native'
import { Text } from '@/lib/typography'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { VerseCard } from './VerseCard'
import { speak, stop as stopSpeech } from '@/lib/speech'
import { useTheme } from '@/context/ThemeContext'
import { useLanguage } from '@/context/LanguageContext'
import type { CitedVerse } from '@/lib/api'
import type { Colors } from '@/lib/theme'

type Props = {
  role: 'user' | 'assistant'
  content: string
  citedVerses?: CitedVerse[]
  lowConfidence?: boolean
  failed?: boolean
  onRetry?: () => void
  bookmarked?: boolean
  onToggleBookmark?: () => void
}

export function MessageBubble({ role, content, citedVerses, lowConfidence, failed, onRetry, bookmarked, onToggleBookmark }: Props) {
  const { colors } = useTheme()
  const { language } = useLanguage()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const isUser = role === 'user'
  const [speaking, setSpeaking] = useState(false)

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Share.share({ message: content })
  }

  async function handleSpeak() {
    if (speaking) {
      stopSpeech()
      setSpeaking(false)
      return
    }
    // Strip verse citation brackets [Surah, X:Y], they're visual markers, not for TTS
    const spoken = content.replace(/\[[^\]]+\]/g, '').trim()
    if (!spoken) return
    setSpeaking(true)
    await speak(spoken, language, {
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
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
              <Text style={styles.retryText}>Failed, tap to retry</Text>
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

        {lowConfidence && (
          <View style={styles.lowConfidenceRow}>
            <Ionicons name="warning-outline" size={13} color={colors.warningText} />
            <Text style={styles.lowConfidenceNote}>Low confidence, consult a scholar for authoritative guidance.</Text>
          </View>
        )}

        {citedVerses && citedVerses.length > 0 && (
          <VerseCard verses={citedVerses} />
        )}

        <View style={styles.actionRow}>
          {onToggleBookmark && (
            <TouchableOpacity
              style={styles.speakBtn}
              onPress={onToggleBookmark}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={15}
                color={bookmarked ? colors.accent : colors.textFaint}
              />
              <Text style={[styles.speakLabel, bookmarked && { color: colors.accent }]}>
                {bookmarked ? 'Saved' : 'Save'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.speakBtn}
            onPress={handleSpeak}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={speaking ? 'stop-circle' : 'volume-medium-outline'}
              size={15}
              color={speaking ? colors.accent : colors.textFaint}
            />
            <Text style={[styles.speakLabel, speaking && { color: colors.accent }]}>
              {speaking ? 'Stop' : 'Listen'}
            </Text>
          </TouchableOpacity>
        </View>
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

    lowConfidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 4 },
    lowConfidenceNote: { color: c.warningText, fontSize: 12, flex: 1, opacity: 0.9 },
    actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 6, paddingHorizontal: 2 },
    speakBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 },
    speakLabel: { color: c.textFaint, fontSize: 12, fontWeight: '500' },
  })
}
