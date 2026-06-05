import * as Notifications from 'expo-notifications'
import { SchedulableTriggerInputTypes } from 'expo-notifications'
import { Platform } from 'react-native'

// A single daily local reminder to come back for the verse of the day. Local
// (no push server needed); the real verse is shown in-app on the home screen.
const DAILY_HOUR = 8
const DAILY_MINUTE = 0
const CHANNEL_ID = 'daily-verse'

export async function enableDailyReminder(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily verse',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  // Only ever keep one schedule.
  await Notifications.cancelAllScheduledNotificationsAsync()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Verse of the day',
      body: 'Your daily verse and reflection is ready. Tap to read it.',
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_HOUR,
      minute: DAILY_MINUTE,
      channelId: CHANNEL_ID,
    },
  })
  return true
}

export async function disableDailyReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
}

export async function isDailyReminderOn(): Promise<boolean> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    return scheduled.length > 0
  } catch {
    return false
  }
}
