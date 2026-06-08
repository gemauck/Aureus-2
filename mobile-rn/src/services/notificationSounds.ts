import { Audio } from 'expo-av'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform, Vibration } from 'react-native'

const STORAGE_KEY = 'abcotronics_notification_sounds_enabled'
const MIN_GAP_MS = 1200

let audioReady = false
let lastAlertAt = 0

const SOUNDS = {
  message: require('../../assets/sounds/message.wav'),
  notification: require('../../assets/sounds/notification.wav')
} as const

export type NotificationSoundKind = keyof typeof SOUNDS

const VIBRATE_MESSAGE_MS = Platform.OS === 'android' ? [0, 220, 120, 220, 120, 220] : 400
const VIBRATE_NOTIFICATION_MS = Platform.OS === 'android' ? [0, 180, 90, 180] : 280

export async function getNotificationSoundsEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY)
    return v !== '0'
  } catch {
    return true
  }
}

export async function setNotificationSoundsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

async function ensureAudioMode() {
  if (audioReady) return
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false
  })
  audioReady = true
}

function shouldThrottleAlert(): boolean {
  const now = Date.now()
  if (now - lastAlertAt < MIN_GAP_MS) return true
  lastAlertAt = now
  return false
}

function vibratePulse(kind: NotificationSoundKind) {
  try {
    const pattern = kind === 'message' ? VIBRATE_MESSAGE_MS : VIBRATE_NOTIFICATION_MS
    if (Array.isArray(pattern)) {
      Vibration.vibrate(pattern as number[], false)
    } else {
      Vibration.vibrate(pattern as number)
    }
  } catch {
    /* non-fatal */
  }
}

export async function playNotificationVibration(kind: NotificationSoundKind = 'notification') {
  if (!(await getNotificationSoundsEnabled())) return
  if (shouldThrottleAlert()) return
  vibratePulse(kind)
}

export async function playNotificationSound(kind: NotificationSoundKind = 'notification') {
  if (!(await getNotificationSoundsEnabled())) return
  if (shouldThrottleAlert()) return

  vibratePulse(kind)

  try {
    await ensureAudioMode()
    const { sound } = await Audio.Sound.createAsync(SOUNDS[kind], { shouldPlay: true, volume: 1 })
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync()
      }
    })
  } catch {
    /* non-fatal */
  }
}
