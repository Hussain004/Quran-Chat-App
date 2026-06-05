import { useState, useMemo, useEffect, useRef } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { Text } from '@/lib/typography'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { playAyah, stopAyah } from '@/lib/recitation'
import { VerseViewerModal } from './VerseViewerModal'
import { useTheme } from '@/context/ThemeContext'
import { type CitedVerse } from '@/lib/api'
import type { Colors } from '@/lib/theme'

type Props = {
  verses: CitedVerse[]
}

type VerseItemProps = {
  verse: CitedVerse
  onShare: () => void
  isPlaying: boolean
  onRecite: () => void
  onContext: () => void
  styles: ReturnType<typeof makeStyles>
  colors: Colors
}

function VerseItem({ verse, onShare, isPlaying, onRecite, onContext, styles, colors }: VerseItemProps) {
  const [tafseerOpen, setTafseerOpen] = useState(false)

  return (
    <TouchableOpacity
      style={styles.verseItem}
      onLongPress={onShare}
      activeOpacity={0.8}
    >
      <View style={styles.verseTopRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{verse.surahNameEn} {verse.surahNumber}:{verse.ayahNumber}</Text>
        </View>
        <View style={styles.verseActions}>
          <TouchableOpacity
            onPress={onContext}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.reciteBtn}
          >
            <Ionicons name="book-outline" size={19} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRecite}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.reciteBtn}
          >
            <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle-outline'} size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.arabic}>{verse.arabicText}</Text>
      <Text style={styles.translation}>{verse.translation}</Text>

      {verse.tafseer ? (
        <View style={styles.tafseerSection}>
          <TouchableOpacity
            style={styles.tafseerToggle}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setTafseerOpen(o => !o)
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.tafseerToggleText}>
              {tafseerOpen ? '▲ Hide Tafseer' : '▼ Ibn Kathir Tafseer'}
            </Text>
          </TouchableOpacity>
          {tafseerOpen && (
            <Text style={styles.tafseerText}>{verse.tafseer}</Text>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  )
}

export function VerseCard({ verses }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [expanded, setExpanded] = useState(false)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [contextTarget, setContextTarget] = useState<CitedVerse | null>(null)
  const [shareVerseData, setShareVerseData] = useState<CitedVerse | null>(null)
  const shotRef = useRef<View>(null)

  // Stop any recitation if this card unmounts (e.g. leaving the chat).
  useEffect(() => () => stopAyah(), [])

  // When a verse is queued for sharing, capture the off-screen branded card to
  // an image and open the share sheet, then clear it.
  useEffect(() => {
    if (!shareVerseData) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const uri = await captureRef(shotRef, { format: 'png', quality: 1 })
        if (!cancelled && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share verse' })
        }
      } catch {
        // ignore capture or share failures
      } finally {
        if (!cancelled) setShareVerseData(null)
      }
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [shareVerseData])

  if (!verses || verses.length === 0) return null

  const surahNames = [...new Set(verses.map(v => v.surahNameEn))].slice(0, 3).join(', ')
  const hasTafseer = verses.some(v => v.tafseer)
  const summary = `${verses.length} verse${verses.length > 1 ? 's' : ''} cited — ${surahNames}${verses.length > 3 ? '…' : ''}`

  function toggleExpand() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setExpanded(e => {
      if (e) { stopAyah(); setPlayingKey(null) }
      return !e
    })
  }

  function reciteVerse(verse: CitedVerse) {
    const key = `${verse.surahNumber}:${verse.ayahNumber}`
    if (playingKey === key) {
      stopAyah()
      setPlayingKey(null)
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setPlayingKey(key)
    playAyah(verse.surahNumber, verse.ayahNumber, {
      onDone: () => setPlayingKey(k => (k === key ? null : k)),
      onError: () => setPlayingKey(k => (k === key ? null : k)),
    })
  }

  function shareImage(verse: CitedVerse) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setShareVerseData(verse)
  }

  function openContext(verse: CitedVerse) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    stopAyah()
    setPlayingKey(null)
    setContextTarget(verse)
  }

  function closeContext() {
    setContextTarget(null)
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.7}>
        <Text style={styles.icon}>📖</Text>
        <Text style={styles.summary}>
          {summary}{hasTafseer ? ' · Tafseer' : ''}
        </Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.versesContainer}>
          {verses.map((verse, i) => (
            <VerseItem
              key={i}
              verse={verse}
              onShare={() => shareImage(verse)}
              isPlaying={playingKey === `${verse.surahNumber}:${verse.ayahNumber}`}
              onRecite={() => reciteVerse(verse)}
              onContext={() => openContext(verse)}
              styles={styles}
              colors={colors}
            />
          ))}
          <Text style={styles.hint}>Tap play to hear the recitation, long press to share as an image</Text>
        </View>
      )}

      <VerseViewerModal
        visible={!!contextTarget}
        surah={contextTarget?.surahNumber ?? null}
        ayah={contextTarget?.ayahNumber ?? null}
        surahNameEn={contextTarget?.surahNameEn}
        onClose={closeContext}
      />

      {shareVerseData && (
        <View style={styles.shotWrap} pointerEvents="none">
          <View ref={shotRef} collapsable={false} style={styles.shareCard}>
            <Text style={styles.shareRef}>{shareVerseData.surahNameEn} {shareVerseData.surahNumber}:{shareVerseData.ayahNumber}</Text>
            <Text style={styles.shareArabic}>{shareVerseData.arabicText}</Text>
            <Text style={styles.shareTranslation}>{shareVerseData.translation}</Text>
            <View style={styles.shareFooter}>
              <Text style={styles.shareBrand}>Qur'an Chat</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { marginTop: 10, backgroundColor: c.surfaceDeep, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.borderFaint },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
    icon: { fontSize: 14 },
    summary: { flex: 1, color: c.accent, fontSize: 13, fontWeight: '500' },
    chevron: { color: c.accent, fontSize: 11 },
    versesContainer: { borderTopWidth: 1, borderTopColor: c.borderFaint, gap: 1 },
    verseItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: c.borderFaint, gap: 8 },
    verseTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    verseActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reciteBtn: { padding: 2 },
    badge: { backgroundColor: c.accentBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: c.accentBorder },
    badgeText: { color: c.accent, fontSize: 12, fontWeight: '600' },
    arabic: { color: c.text, fontSize: 26, textAlign: 'right', lineHeight: 48, fontFamily: 'NoorHira', writingDirection: 'rtl' },
    translation: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    tafseerSection: { marginTop: 4, gap: 8 },
    tafseerToggle: { flexDirection: 'row', alignItems: 'center' },
    tafseerToggleText: { color: c.accent, fontSize: 12, fontWeight: '500', opacity: 0.85 },
    tafseerText: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
    hint: { color: c.textFaint, fontSize: 11, textAlign: 'center', paddingVertical: 8 },

    // Off-screen branded card captured for image sharing (fixed palette so the
    // shared image always looks the same regardless of the in-app theme).
    shotWrap: { position: 'absolute', left: -9999, top: 0 },
    shareCard: { width: 360, backgroundColor: '#0D1B14', padding: 28, gap: 18, borderWidth: 1, borderColor: '#2D4A38' },
    shareRef: { color: '#C9A84C', fontSize: 15, fontFamily: 'Fraunces' },
    shareArabic: { color: '#F8F4ED', fontSize: 30, lineHeight: 58, textAlign: 'right', fontFamily: 'NoorHira', writingDirection: 'rtl' },
    shareTranslation: { color: '#D8D2C8', fontSize: 16, lineHeight: 26 },
    shareFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, borderTopWidth: 1, borderTopColor: '#2D4A38', paddingTop: 14 },
    shareBrand: { color: '#C9A84C', fontSize: 14, fontFamily: 'Fraunces' },
  })
}
