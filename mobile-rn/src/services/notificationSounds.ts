import { Audio } from 'expo-av'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'abcotronics_notification_sounds_enabled'
const MIN_GAP_MS = 1200

let audioReady = false
let lastPlayedAt = 0

const SOUNDS = {
  message: require('../../assets/sounds/message.wav'),
  notification: require('../../assets/sounds/notification.wav')
} as const

export type NotificationSoundKind = keyof typeof SOUNDS

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

export async function playNotificationSound(kind: NotificationSoundKind = 'notification') {
  if (!(await getNotificationSoundsEnabled())) return
  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return
  lastPlayedAt = now

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
