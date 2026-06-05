import { useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native'
import { Text } from '@/lib/typography'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { playAyah, stopAyah } from '@/lib/recitation'
import { useTheme } from '@/context/ThemeContext'
import { fetchVerseContext, type ContextVerse } from '@/lib/api'
import type { Colors } from '@/lib/theme'

type Props = {
  visible: boolean
  surah: number | null
  ayah: number | null
  surahNameEn?: string
  onClose: () => void
}

// A bottom-sheet that shows an ayah together with the verses around it and lets
// the reader play each one's recitation. Used from the Verse of the Day card and
// from the "read in context" button on cited verses.
export function VerseViewerModal({ visible, surah, ayah, surahNameEn, onClose }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [verses, setVerses] = useState<ContextVerse[] | null>(null)
  const [playingKey, setPlayingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!visible || surah == null || ayah == null) return
    setVerses(null)
    let cancelled = false
    fetchVerseContext(surah, ayah, 3)
      .then(v => { if (!cancelled) setVerses(v) })
      .catch(() => { if (!cancelled) setVerses([]) })
    return () => { cancelled = true }
  }, [visible, surah, ayah])

  // Stop recitation whenever the sheet is hidden or unmounts.
  useEffect(() => {
    if (!visible) { stopAyah(); setPlayingKey(null) }
  }, [visible])
  useEffect(() => () => stopAyah(), [])

  function recite(v: ContextVerse) {
    const key = `${v.surahNumber}:${v.ayahNumber}`
    if (playingKey === key) {
      stopAyah()
      setPlayingKey(null)
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setPlayingKey(key)
    playAyah(v.surahNumber, v.ayahNumber, {
      onDone: () => setPlayingKey(k => (k === key ? null : k)),
      onError: () => setPlayingKey(k => (k === key ? null : k)),
    })
  }

  function handleClose() {
    stopAyah()
    setPlayingKey(null)
    onClose()
  }

  const title = surahNameEn ? `${surahNameEn} ${surah}` : surah != null ? `Surah ${surah}` : ''

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {verses === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {verses.map(v => {
                const key = `${v.surahNumber}:${v.ayahNumber}`
                const focal = v.ayahNumber === ayah
                const isPlaying = playingKey === key
                return (
                  <View key={key} style={[styles.verse, focal && styles.verseFocal]}>
                    <View style={styles.verseHead}>
                      <Text style={styles.ayahNum}>{v.surahNumber}:{v.ayahNumber}</Text>
                      <TouchableOpacity
                        onPress={() => recite(v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isPlaying ? 'pause-circle' : 'play-circle-outline'}
                          size={26}
                          color={colors.accent}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.arabic}>{v.arabicText}</Text>
                    <Text style={styles.translation}>{v.translation}</Text>
                  </View>
                )
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: c.borderFaint },
    title: { color: c.text, fontSize: 18, fontFamily: 'Fraunces' },
    loading: { paddingVertical: 40 },
    scroll: { padding: 16, paddingBottom: 32, gap: 18 },

    verse: { gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.borderFaint },
    verseFocal: { backgroundColor: c.surface, borderRadius: 12, padding: 12, borderBottomWidth: 0, borderLeftWidth: 3, borderLeftColor: c.accent },
    verseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    ayahNum: { color: c.accent, fontSize: 12, fontWeight: '600' },
    arabic: { color: c.text, fontSize: 26, textAlign: 'right', lineHeight: 48, fontFamily: 'NoorHira', writingDirection: 'rtl' },
    translation: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
  })
}
