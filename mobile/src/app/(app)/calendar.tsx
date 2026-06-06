import { useState, useMemo, useEffect } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Text } from '@/lib/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'
import {
  gregorianToHijri,
  fetchHijriDateFromAPI,
  getHijriMonthDays,
  prevHijriMonth,
  nextHijriMonth,
  HIJRI_MONTHS,
  ISLAMIC_EVENTS,
  type HijriDate,
  type HijriDay,
} from '@/lib/hijri'

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function buildGrid(days: HijriDay[]): Array<HijriDay | null>[] {
  if (days.length === 0) return []
  const startDow = days[0].gDate.getDay() // 0=Sun
  const cells: Array<HijriDay | null> = [
    ...Array<null>(startDow).fill(null),
    ...days,
  ]
  const rows: Array<HijriDay | null>[] = []
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7)
    while (row.length < 7) row.push(null)
    rows.push(row)
  }
  return rows
}

function gregorianRange(days: HijriDay[]): string {
  if (days.length === 0) return ''
  const first = days[0].gDate
  const last = days[days.length - 1].gDate
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const firstStr = first.toLocaleDateString('en-US', opts)
  const lastStr = last.toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${firstStr} - ${lastStr}`
}

export default function CalendarScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top, bottom } = useSafeAreaInsets()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    return d
  }, [])

  // Start instantly from the local algorithm; silently refine with the Aladhan API
  // (Umm al-Qura method -- the global standard) when online.
  const localTodayH = useMemo(() => gregorianToHijri(today), [today])
  const [todayHijri, setTodayHijri] = useState<HijriDate>(localTodayH)
  const [viewYear, setViewYear] = useState(localTodayH.year)
  const [viewMonth, setViewMonth] = useState(localTodayH.month)

  useEffect(() => {
    let cancelled = false
    fetchHijriDateFromAPI(today).then(apiDate => {
      if (cancelled || !apiDate) return
      setTodayHijri(apiDate)
      // Snap the view only if the user hasn't already navigated to a different month.
      setViewYear(prev => prev === localTodayH.year ? apiDate.year : prev)
      setViewMonth(prev => prev === localTodayH.month ? apiDate.month : prev)
    })
    return () => { cancelled = true }
  }, [])

  const monthDays = useMemo(() => getHijriMonthDays(viewYear, viewMonth), [viewYear, viewMonth])
  const calendarRows = useMemo(() => buildGrid(monthDays), [monthDays])
  const gRange = useMemo(() => gregorianRange(monthDays), [monthDays])
  const events = ISLAMIC_EVENTS[viewMonth] ?? {}
  const eventEntries = Object.entries(events).sort((a, b) => +a[0] - +b[0])

  const isCurrentMonth = viewYear === todayHijri.year && viewMonth === todayHijri.month

  function goToPrev() {
    const p = prevHijriMonth(viewYear, viewMonth)
    setViewYear(p.year)
    setViewMonth(p.month)
  }

  function goToNext() {
    const n = nextHijriMonth(viewYear, viewMonth)
    setViewYear(n.year)
    setViewMonth(n.month)
  }

  function goToToday() {
    setViewYear(todayHijri.year)
    setViewMonth(todayHijri.month)
  }

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <StatusBar style={colors.statusBar} />

      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Islamic Calendar</Text>
        {!isCurrentMonth && (
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: today's Hijri date */}
        <View style={styles.heroCard}>
          <View style={styles.heroDateRow}>
            <Text style={styles.heroDay}>{todayHijri.day}</Text>
            <View style={styles.heroMonthYear}>
              <Text style={styles.heroMonth}>{HIJRI_MONTHS[todayHijri.month - 1]}</Text>
              <Text style={styles.heroYear}>{todayHijri.year} AH</Text>
            </View>
          </View>
          <Text style={styles.heroGregorian}>
            {today.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          {ISLAMIC_EVENTS[todayHijri.month]?.[todayHijri.day] ? (
            <View style={styles.heroEvent}>
              <Ionicons name="star" size={12} color={colors.accent} />
              <Text style={styles.heroEventText}>
                {ISLAMIC_EVENTS[todayHijri.month]![todayHijri.day]}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navArrow} onPress={goToPrev} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
          </TouchableOpacity>
          <View style={styles.monthTitleWrap}>
            <Text style={styles.monthTitle}>{HIJRI_MONTHS[viewMonth - 1]} {viewYear}</Text>
            {gRange ? <Text style={styles.monthRange}>{gRange}</Text> : null}
          </View>
          <TouchableOpacity style={styles.navArrow} onPress={goToNext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Day of week header */}
        <View style={styles.dowRow}>
          {DOW_LABELS.map(d => (
            <Text key={d} style={styles.dowLabel}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {calendarRows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((cell, ci) => {
                if (!cell) {
                  return <View key={ci} style={styles.gridCell} />
                }
                const isToday = isSameDay(cell.gDate, today)
                const hasEvent = !!events[cell.hDay]
                return (
                  <View key={ci} style={styles.gridCell}>
                    <View style={[styles.dayCircle, isToday && styles.dayCircleToday]}>
                      <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                        {cell.hDay}
                      </Text>
                      {hasEvent ? (
                        <View style={[styles.eventDot, isToday && styles.eventDotToday]} />
                      ) : null}
                    </View>
                  </View>
                )
              })}
            </View>
          ))}
        </View>

        {/* Islamic events in this month */}
        {eventEntries.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.eventsHeading}>Events in {HIJRI_MONTHS[viewMonth - 1]}</Text>
            {eventEntries.map(([day, name]) => (
              <View key={day} style={styles.eventRow}>
                <View style={styles.eventBadge}>
                  <Text style={styles.eventBadgeText}>{day}</Text>
                </View>
                <Text style={styles.eventName}>{name}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingBottom: 12,
      paddingTop: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderFaint,
    },
    pageTitle: { color: c.text, fontSize: 20, fontWeight: '700' },
    todayBtn: {
      backgroundColor: c.accent + '22',
      borderColor: c.accent + '55',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    todayBtnText: { color: c.accent, fontSize: 13, fontWeight: '600' },

    content: { paddingHorizontal: 20, paddingTop: 20 },

    heroCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.accentBorder,
      marginBottom: 24,
      gap: 8,
    },
    heroDateRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    heroDay: {
      color: c.accent,
      fontSize: 56,
      fontFamily: 'Fraunces',
      lineHeight: 60,
    },
    heroMonthYear: { gap: 2 },
    heroMonth: { color: c.text, fontSize: 20, fontFamily: 'Fraunces' },
    heroYear: { color: c.textSecondary, fontSize: 14 },
    heroGregorian: { color: c.textFaint, fontSize: 13 },
    heroEvent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accent + '18',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
    },
    heroEventText: { color: c.accent, fontSize: 12, fontWeight: '600' },

    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    navArrow: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    monthTitleWrap: { alignItems: 'center', flex: 1 },
    monthTitle: { color: c.text, fontSize: 16, fontWeight: '700', fontFamily: 'Fraunces' },
    monthRange: { color: c.textFaint, fontSize: 12, marginTop: 2 },

    dowRow: { flexDirection: 'row', marginBottom: 4 },
    dowLabel: {
      flex: 1,
      textAlign: 'center',
      color: c.textFaint,
      fontSize: 12,
      fontWeight: '600',
    },

    grid: { marginBottom: 28 },
    gridRow: { flexDirection: 'row' },
    gridCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },

    dayCircle: {
      width: 36,
      height: 40,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 2,
    },
    dayCircleToday: { backgroundColor: c.accent },
    dayNumber: { color: c.text, fontSize: 14 },
    dayNumberToday: { color: '#fff', fontWeight: '700' },
    eventDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.accent,
    },
    eventDotToday: { backgroundColor: '#fff' },

    eventsSection: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    eventsHeading: {
      color: c.textFaint,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    eventBadge: {
      backgroundColor: c.accent + '22',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      minWidth: 28,
      alignItems: 'center',
    },
    eventBadgeText: { color: c.accent, fontSize: 12, fontWeight: '700' },
    eventName: { color: c.text, fontSize: 14, flex: 1 },
  })
}
