import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
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
    Share.share({ message: content })
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
              <Ionicons name="refresh-outline" size={13} color="#F87171" />
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
        <Ionicons name="sparkles" size={14} color="#C9A84C" />
      </View>
      <View style={styles.aiContent}>
        <TouchableOpacity style={styles.aiBubble} onLongPress={handleLongPress} activeOpacity={0.9}>
          <Text style={styles.aiText}>{content}</Text>
        </TouchableOpacity>
        {citedVerses && citedVerses.length > 0 && (
          <VerseCard verses={citedVerses} />
        )}
        {lowConfidence && (
          <View style={styles.lowConfidenceRow}>
            <Ionicons name="warning-outline" size={13} color="#F5A623" />
            <Text style={styles.lowConfidenceNote}>Low confidence match — please consult a scholar for authoritative guidance.</Text>
          </View>
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
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, paddingHorizontal: 4 },
  retryText: { color: '#F87171', fontSize: 12 },

  aiRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 8, alignItems: 'flex-start' },
  aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#C9A84C20', justifyContent: 'center', alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#C9A84C40' },
  aiContent: { flex: 1 },
  aiBubble: { backgroundColor: '#152B1F', borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 3, borderLeftColor: '#C9A84C' },
  aiText: { color: '#F8F4ED', fontSize: 15, lineHeight: 24 },
  lowConfidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 4 },
  lowConfidenceNote: { color: '#F5A623', fontSize: 12, flex: 1, opacity: 0.8 },
})
