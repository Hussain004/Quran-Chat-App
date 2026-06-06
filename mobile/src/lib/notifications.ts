import * as Notifications from 'expo-notifications'
import { SchedulableTriggerInputTypes } from 'expo-notifications'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const DAILY_VERSE_ID = 'daily-verse'
const DAILY_CHANNEL = 'daily-verse'
const PRAYER_CHANNEL = 'prayer-times'
const PRAYER_IDS_KEY = 'prayer-notification-ids'
const PRAYER_ENABLED_KEY = 'prayer-notifications-enabled'
const DAILY_HOUR = 8
const DAILY_MINUTE = 0

// --- Daily verse reminder ---

export async function enableDailyReminder(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DAILY_CHANNEL, {
      name: 'Daily verse',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  // Cancel by identifier so we don't disturb prayer notifications.
  await Notifications.cancelScheduledNotificationAsync(DAILY_VERSE_ID).catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_VERSE_ID,
    content: {
      title: 'Verse of the day',
      body: 'Your daily verse and reflection is ready. Tap to read it.',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_HOUR,
      minute: DAILY_MINUTE,
      channelId: DAILY_CHANNEL,
    },
  })
  return true
}

export async function disableDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_VERSE_ID).catch(() => {})
}

export async function isDailyReminderOn(): Promise<boolean> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    return scheduled.some(n => n.identifier === DAILY_VERSE_ID)
  } catch {
    return false
  }
}

// --- Prayer time notifications ---

export type PrayerForNotif = { key: string; label: string; time: Date }

export async function isPrayerNotificationsEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRAYER_ENABLED_KEY)) === 'true'
  } catch {
    return false
  }
}

export async function enablePrayerNotifications(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false
  await AsyncStorage.setItem(PRAYER_ENABLED_KEY, 'true')
  return true
}

export async function disablePrayerNotifications(): Promise<void> {
  await AsyncStorage.setItem(PRAYER_ENABLED_KEY, 'false')
  await cancelPrayerNotifications()
}

export async function schedulePrayerNotifications(prayers: PrayerForNotif[]): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PRAYER_CHANNEL, {
      name: 'Prayer times',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    })
  }

  // Cancel previously scheduled prayer notifications.
  const storedRaw = await AsyncStorage.getItem(PRAYER_IDS_KEY).catch(() => null)
  const storedIds: string[] = storedRaw ? JSON.parse(storedRaw) : []
  await Promise.allSettled(
    storedIds.map(id => Notifications.cancelScheduledNotificationAsync(id)),
  )

  const now = new Date()
  const newIds: string[] = []

  for (const prayer of prayers) {
    if (prayer.time.getTime() <= now.getTime()) continue
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${prayer.label} Prayer`,
          body: `It is time for ${prayer.label}.`,
          sound: 'default',
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: prayer.time,
          channelId: PRAYER_CHANNEL,
        },
      })
      newIds.push(id)
    } catch { /* skip past or invalid times */ }
  }

  await AsyncStorage.setItem(PRAYER_IDS_KEY, JSON.stringify(newIds))
}

export async function cancelPrayerNotifications(): Promise<void> {
  const storedRaw = await AsyncStorage.getItem(PRAYER_IDS_KEY).catch(() => null)
  const storedIds: string[] = storedRaw ? JSON.parse(storedRaw) : []
  await Promise.allSettled(
    storedIds.map(id => Notifications.cancelScheduledNotificationAsync(id)),
  )
  await AsyncStorage.setItem(PRAYER_IDS_KEY, JSON.stringify([]))
}
