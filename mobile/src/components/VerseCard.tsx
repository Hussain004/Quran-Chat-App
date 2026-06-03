import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native'
import * as Haptics from 'expo-haptics'
import type { CitedVerse } from '@/lib/api'

type Props = {
  verses: CitedVerse[]
}

export function VerseCard({ verses }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!verses || verses.length === 0) return null

  const surahNames = [...new Set(verses.map(v => v.surahNameEn))].slice(0, 3).join(', ')
  const summary = `${verses.length} verse${verses.length > 1 ? 's' : ''} cited — ${surahNames}${verses.length > 3 ? '…' : ''}`

  function toggleExpand() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setExpanded(e => !e)
  }

  async function shareVerse(verse: CitedVerse) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    await Share.share({
      message: `${verse.arabicText}\n\n"${verse.translation}"\n\n— ${verse.surahNameEn} ${verse.surahNumber}:${verse.ayahNumber}`,
    })
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.7}>
        <Text style={styles.icon}>📖</Text>
        <Text style={styles.summary}>{summary}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.versesContainer}>
          {verses.map((verse, i) => (
            <TouchableOpacity
              key={i}
              style={styles.verseItem}
              onLongPress={() => shareVerse(verse)}
              activeOpacity={0.8}
            >
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{verse.surahNameEn} {verse.surahNumber}:{verse.ayahNumber}</Text>
              </View>
              <Text style={styles.arabic}>{verse.arabicText}</Text>
              <Text style={styles.translation}>{verse.translation}</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.hint}>Long press a verse to share</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: 10, backgroundColor: '#0D2218', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1E3525' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  icon: { fontSize: 14 },
  summary: { flex: 1, color: '#C9A84C', fontSize: 13, fontWeight: '500' },
  chevron: { color: '#C9A84C', fontSize: 11 },
  versesContainer: { borderTopWidth: 1, borderTopColor: '#1E3525', gap: 1 },
  verseItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#1E3525', gap: 8 },
  badge: { backgroundColor: '#C9A84C20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#C9A84C40' },
  badgeText: { color: '#C9A84C', fontSize: 12, fontWeight: '600' },
  arabic: { color: '#F8F4ED', fontSize: 26, textAlign: 'right', lineHeight: 48, fontFamily: 'NoorHira', writingDirection: 'rtl' },
  translation: { color: '#D1CEC8', fontSize: 13, lineHeight: 20 },
  hint: { color: '#6B7280', fontSize: 11, textAlign: 'center', paddingVertical: 8 },
})
