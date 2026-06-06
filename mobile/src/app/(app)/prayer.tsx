import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Text } from '@/lib/typography'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { Magnetometer } from 'expo-sensors'
import { Coordinates, CalculationMethod, PrayerTimes, Qibla, Madhab } from 'adhan'
import { useTheme } from '@/context/ThemeContext'
import type { Colors } from '@/lib/theme'
import { isPrayerNotificationsEnabled, schedulePrayerNotifications } from '@/lib/notifications'

type Prayer = {
  key: string
  label: string
  arabic: string
  time: Date
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m} ${period}`
}

function timeUntil(d: Date): string {
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return 'Now'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function PrayerScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { top, bottom } = useSafeAreaInsets()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cityName, setCityName] = useState<string | null>(null)
  const [prayers, setPrayers] = useState<Prayer[] | null>(null)
  const [nextKey, setNextKey] = useState<string | null>(null)
  const [nextPrayer, setNextPrayer] = useState<Prayer | null>(null)
  const [nextCountdown, setNextCountdown] = useState('')
  const [qiblaBearing, setQiblaBearing] = useState<number | null>(null)
  const [heading, setHeading] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission is required to calculate prayer times.\n\nPlease enable it in your device settings.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      })
      const { latitude, longitude } = loc.coords

      const coords = new Coordinates(latitude, longitude)
      const params = CalculationMethod.MuslimWorldLeague()
      params.madhab = Madhab.Hanafi
      const times = new PrayerTimes(coords, new Date(), params)

      const list: Prayer[] = [
        { key: 'fajr', label: 'Fajr', arabic: 'الفجر', time: times.fajr },
        { key: 'dhuhr', label: 'Dhuhr', arabic: 'الظهر', time: times.dhuhr },
        { key: 'asr', label: 'Asr', arabic: 'العصر', time: times.asr },
        { key: 'maghrib', label: 'Maghrib', arabic: 'المغرب', time: times.maghrib },
        { key: 'isha', label: 'Isha', arabic: 'العشاء', time: times.isha },
      ]
      setPrayers(list)
      setQiblaBearing(Qibla(coords))

      const now = new Date()
      let next = list.find(p => p.time > now)
      if (!next) {
        // All today's prayers have passed -- use tomorrow's Fajr
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowTimes = new PrayerTimes(coords, tomorrow, params)
        next = { key: 'fajr', label: 'Fajr', arabic: 'الفجر', time: tomorrowTimes.fajr }
      }
      setNextKey(next.key)
      setNextPrayer(next)

      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude })
        setCityName(geo[0]?.city ?? geo[0]?.district ?? geo[0]?.region ?? null)
      } catch { /* city name is optional */ }

      // Schedule prayer notifications for today and tomorrow if enabled.
      try {
        const notifEnabled = await isPrayerNotificationsEnabled()
        if (notifEnabled) {
          const tomorrowDate = new Date()
          tomorrowDate.setDate(tomorrowDate.getDate() + 1)
          const tomorrowTimes = new PrayerTimes(coords, tomorrowDate, params)
          await schedulePrayerNotifications([
            ...list,
            { key: 'fajr',    label: 'Fajr',    time: tomorrowTimes.fajr },
            { key: 'dhuhr',   label: 'Dhuhr',   time: tomorrowTimes.dhuhr },
            { key: 'asr',     label: 'Asr',     time: tomorrowTimes.asr },
            { key: 'maghrib', label: 'Maghrib', time: tomorrowTimes.maghrib },
            { key: 'isha',    label: 'Isha',    time: tomorrowTimes.isha },
          ])
        }
      } catch { /* non-critical */ }
    } catch (e: any) {
      setError(e?.message ?? 'Could not get your location. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh countdown every minute
  useEffect(() => {
    if (!nextPrayer) return
    const update = () => setNextCountdown(timeUntil(nextPrayer.time))
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [nextPrayer])

  // Magnetometer for Qibla compass heading
  useEffect(() => {
    Magnetometer.setUpdateInterval(150)
    const sub = Magnetometer.addListener(({ x, y }) => {
      // atan2(-x, y): when device top points North, B_x=0, B_y=+Bh → 0°.
      // When top points East, B_x=-Bh, B_y=0 → atan2(Bh, 0) = 90°. Correct compass convention.
      let angle = Math.atan2(-x, y) * (180 / Math.PI)
      if (angle < 0) angle += 360
      setHeading(angle)
    })
    return () => sub.remove()
  }, [])

  const arrowDeg = qiblaBearing !== null ? (qiblaBearing - heading + 360) % 360 : 0

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <StatusBar style={colors.statusBar} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Prayer Times</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); load() }}
          disabled={loading}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={loading ? colors.textFaint : colors.accent}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {cityName ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={colors.textFaint} />
            <Text style={styles.locationText}>{cityName}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={22} color={colors.accent} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : loading && !prayers ? (
          <View style={styles.centerBox}>
            <Text style={styles.loadingText}>Getting your location...</Text>
          </View>
        ) : prayers ? (
          <>
            {nextPrayer && nextCountdown ? (
              <View style={styles.nextBanner}>
                <Text style={styles.nextLabel}>Next prayer</Text>
                <Text style={styles.nextName}>{nextPrayer.label}</Text>
                <Text style={styles.nextTime}>{formatTime(nextPrayer.time)}</Text>
                <Text style={styles.nextCountdown}>
                  {nextCountdown === 'Now' ? 'Now' : `in ${nextCountdown}`}
                </Text>
              </View>
            ) : null}

            {prayers.map(p => {
              const isNext = p.key === nextKey
              return (
                <View key={p.key} style={[styles.prayerCard, isNext && styles.prayerCardNext]}>
                  <View>
                    <Text style={[styles.prayerName, isNext && styles.prayerNameNext]}>
                      {p.label}
                    </Text>
                    <Text style={styles.prayerArabic}>{p.arabic}</Text>
                  </View>
                  <Text style={[styles.prayerTime, isNext && styles.prayerTimeNext]}>
                    {formatTime(p.time)}
                  </Text>
                </View>
              )
            })}

            <View style={styles.qiblaSection}>
              <Text style={styles.qiblaTitle}>Qibla</Text>
              {qiblaBearing !== null ? (
                <Text style={styles.qiblaBearing}>
                  {Math.round(qiblaBearing)}{'°'} from North
                </Text>
              ) : null}

              <View style={styles.compassRing}>
                <Text style={styles.compassLabel} numberOfLines={1}>N</Text>
                <Text style={[styles.compassLabel, styles.compassS]}>S</Text>
                <Text style={[styles.compassLabel, styles.compassE]}>E</Text>
                <Text style={[styles.compassLabel, styles.compassW]}>W</Text>

                <View
                  style={[
                    styles.compassArrow,
                    { transform: [{ rotate: `${arrowDeg}deg` }] },
                  ]}
                >
                  <View style={styles.arrowTip} />
                  <View style={styles.arrowShaft} />
                </View>
                <View style={styles.compassDot} />
              </View>

              <Text style={styles.compassHint}>
                Hold device level and face the direction the arrow points
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
      paddingTop: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderFaint,
    },
    headerTitle: { color: c.text, fontSize: 20, fontWeight: '700' },
    refreshBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-end' },

    content: { paddingHorizontal: 20, paddingTop: 16 },

    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
    locationText: { color: c.textFaint, fontSize: 13 },

    centerBox: { alignItems: 'center', paddingVertical: 60 },
    loadingText: { color: c.textFaint, fontSize: 14 },

    errorBox: { alignItems: 'center', gap: 12, paddingVertical: 50 },
    errorText: { color: c.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 22 },
    retryBtn: {
      backgroundColor: c.accent + '22',
      borderColor: c.accent + '66',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    retryText: { color: c.accent, fontSize: 14 },

    nextBanner: {
      backgroundColor: c.accent + '18',
      borderColor: c.accent + '55',
      borderWidth: 1,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      marginBottom: 20,
    },
    nextLabel: { color: c.textFaint, fontSize: 12, marginBottom: 4 },
    nextName: { color: c.accent, fontSize: 24, fontWeight: '700', fontFamily: 'Fraunces' },
    nextTime: { color: c.text, fontSize: 16, fontWeight: '500', marginTop: 2 },
    nextCountdown: { color: c.textFaint, fontSize: 13, marginTop: 4 },

    prayerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    prayerCardNext: { borderColor: c.accent, backgroundColor: c.accent + '0F' },
    prayerName: { color: c.text, fontSize: 16, fontWeight: '600' },
    prayerNameNext: { color: c.accent },
    prayerArabic: {
      color: c.textFaint,
      fontSize: 19,
      fontFamily: 'NoorHira',
      marginTop: 2,
      writingDirection: 'rtl',
    },
    prayerTime: { color: c.textSecondary, fontSize: 16, fontWeight: '500' },
    prayerTimeNext: { color: c.accent, fontWeight: '700' },

    qiblaSection: { marginTop: 32, alignItems: 'center', paddingBottom: 8 },
    qiblaTitle: { color: c.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
    qiblaBearing: { color: c.textFaint, fontSize: 13, marginBottom: 24 },

    compassRing: {
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: c.accent + '55',
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    compassLabel: {
      position: 'absolute',
      top: 8,
      color: c.accent,
      fontSize: 13,
      fontWeight: '700',
    },
    compassS: { top: undefined, bottom: 8, color: c.textFaint },
    compassE: { top: undefined, right: 10, color: c.textFaint },
    compassW: { top: undefined, left: 10, color: c.textFaint },

    compassArrow: {
      position: 'absolute',
      width: 40,
      height: 150,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowTip: {
      width: 0,
      height: 0,
      borderLeftWidth: 10,
      borderRightWidth: 10,
      borderBottomWidth: 54,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: c.accent,
    },
    arrowShaft: {
      width: 4,
      height: 54,
      backgroundColor: c.borderFaint,
      borderRadius: 2,
    },
    compassDot: {
      position: 'absolute',
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.accent,
    },

    compassHint: {
      color: c.textFaint,
      fontSize: 12,
      marginTop: 16,
      textAlign: 'center',
      maxWidth: 220,
    },
  })
}
