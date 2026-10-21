// Small key-value store for the session. Native uses the keychain/keystore (expo-secure-store);
// web has no secure storage, so it falls back to localStorage.
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const web = Platform.OS === 'web'

export async function getItem(key: string): Promise<string | null> {
  if (web) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  return SecureStore.getItemAsync(key)
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // private mode or blocked storage: the session simply does not survive a reload
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function removeItem(key: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.deleteItemAsync(key)
}
