import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'abcotronics_mobile_chat_push_enabled'

export async function getChatPushEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    // Default on — user can disable in Messages settings
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export async function setChatPushEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
