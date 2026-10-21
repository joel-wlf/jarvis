import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Page } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { BlockButton, Field, Notice, Toggle } from '@/components/ui'
import { useSession } from '@/state/session'
import { errorText } from '@/i18n/format'
import { type } from '@/theme/type'

export default function Access() {
  return <Page title="Dein Passwort" back><AdminGate><Form /></AdminGate></Page>
}
function Form() {
  const { admin } = useAdmin()
  const { signOut } = useSession()
  const router = useRouter()
  const [old, setOld] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setError(null)
    if (password.length < 15 || password.length > 200) { setError('Bitte wähle 15 bis 200 Zeichen.'); return }
    if (password !== repeat) { setError('Die neuen Passwörter stimmen nicht überein.'); return }
    setBusy(true)
    try {
      await admin.changePassword(old, password)
      setOld(''); setPassword(''); setRepeat('')
      await signOut()
      router.replace('/connect')
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <View style={{ gap: 20 }}>
    <Text style={type.body}>Dieses Passwort gilt für Web, Mobile, Verwaltung und neue MCP-Anmeldungen. Nach dem Wechsel meldest du dich auf deinen Geräten erneut an; bisherige OAuth-Verbindungen werden widerrufen.</Text>
    <Field label="Aktuelles Passwort" value={old} onChangeText={setOld} secureTextEntry={!show} autoComplete="current-password" autoCorrect={false} autoCapitalize="none" />
    <Field label="Neues Passwort" help="15 bis 200 Zeichen. Verwende eine lange Passphrase oder einen Passwortmanager." value={password} onChangeText={setPassword} secureTextEntry={!show} autoComplete="new-password" autoCorrect={false} autoCapitalize="none" />
    <Field label="Neues Passwort wiederholen" value={repeat} onChangeText={setRepeat} secureTextEntry={!show} autoComplete="new-password" autoCorrect={false} autoCapitalize="none" />
    <Toggle label="Passwörter anzeigen" value={show} onChange={setShow} />
    {error ? <Notice level="error" text={error} /> : null}
    <BlockButton label="Passwort ändern und neu anmelden" busy={busy} disabled={!old || !password || !repeat} onPress={() => void submit()} />
  </View>
}
