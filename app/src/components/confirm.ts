import { Alert, Platform } from 'react-native'

/** Asks before something irreversible. Native uses the system alert, web the browser dialog. */
export function confirm(message: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(message))
  return new Promise((resolve) =>
    Alert.alert('', message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  )
}
