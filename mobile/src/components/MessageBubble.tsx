import { View, Text, TouchableOpacity, StyleSheet, Clipboard } from 'react-native'
import * as Haptics from 'expo-haptics'
import { VerseCard } from './VerseCard'
import type { CitedVerse } from '@/lib/api'

type Props = {
  role: 'user' | 'assistant'
  content: string
  citedVerses?: CitedVerse[]
  lowConfidence?: boolean
  failed?: boolean
  onRetry?: () => void
}

export function MessageBubble({ role, content, citedVerses, lowConfidence, failed, onRetry }: Props) {
  const isUser = role === 'user'

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Clipboard.setString(content)
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
              <Text style={styles.retryText}>↺ Failed — tap to retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiAvatar}>
        <Text style={styles.aiAvatarText}>✦</Text>
      </View>
      <View style={styles.aiContent}>
        <TouchableOpacity style={styles.aiBubble} onLongPress={handleLongPress} activeOpacity={0.9}>
          <Text style={styles.aiText}>{content}</Text>
        </TouchableOpacity>
        {citedVerses && citedVerses.length > 0 && (
          <VerseCard verses={citedVerses} />
        )}
        {lowConfidence && (
          <Text style={styles.lowConfidenceNote}>
            ⚠ Low confidence match — please consult a scholar for authoritative guidance.
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 4 },
  userMsgGroup: { alignItems: 'flex-end', maxWidth: '80%' },
  userBubble: { backgroundColor: '#1A4731', borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 16, paddingVertical: 12 },
  userBubbleFailed: { backgroundColor: '#3B1A1A', borderColor: '#7A2A2A', borderWidth: 1 },
  userText: { color: '#F8F4ED', fontSize: 15, lineHeight: 22 },
  retryRow: { marginTop: 4, paddingHorizontal: 4 },
  retryText: { color: '#F87171', fontSize: 12 },

  aiRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 8, alignItems: 'flex-start' },
  aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#C9A84C20', justifyContent: 'center', alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#C9A84C40' },
  aiAvatarText: { color: '#C9A84C', fontSize: 12 },
  aiContent: { flex: 1 },
  aiBubble: { backgroundColor: '#152B1F', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: '#C9A84C' },
  aiText: { color: '#F8F4ED', fontSize: 15, lineHeight: 24 },
  lowConfidenceNote: { color: '#F5A623', fontSize: 12, marginTop: 6, paddingHorizontal: 4, opacity: 0.8 },
})
