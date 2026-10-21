import { useEffect, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SvgXml } from 'react-native-svg'
import type { ConnectionInfo } from '@/api/admin'
import { Page, Section } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { BlockButton, Notice } from '@/components/ui'
import { errorText } from '@/i18n/format'
import { type } from '@/theme/type'

export default function Connections() {
  return <Page title="Verbindungen" back><AdminGate><Content /></AdminGate></Page>
}
function Content() {
  const { admin } = useAdmin()
  const router = useRouter()
  const [info, setInfo] = useState<ConnectionInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void admin.connection().then(setInfo).catch((e) => setError(errorText(e))) }, [admin])
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Adresse kopiert.') }
    catch { setError('Kopieren ist hier nicht verfügbar. Du kannst die Adresse markieren und kopieren.') }
  }
  return <>
    {error ? <Notice level="error" text={error} /> : null}
    {message ? <Notice level="ok" text={message} /> : null}
    <Section title="Quellen"><Text style={type.body}>WhatsApp-Nachrichten und Verlauf auf deinem Server erfassen.</Text><BlockButton label="WhatsApp verbinden oder verwalten" variant="line" onPress={() => router.push('/system/whatsapp')} /></Section>
    {!info ? <Text style={type.body}>Verbindungen werden geladen …</Text> : <>
      <Section title="Mobile App verbinden">
        <Text style={type.body}>Scanne den QR-Code in der Mobile App oder gib die Server-Adresse ein. Melde dich anschließend mit deinem Passwort an.</Text>
        {info.localOnly ? <Notice level="warn" text="localhost ist vom Handy aus nicht erreichbar. Trage unter Einstellungen → Zugang & Fernzugriff eine Heimnetz-Adresse ein." /> : null}
        <Text selectable style={type.body}>{info.url}</Text>
        <View style={{ alignItems: 'center' }}>{info.qrSvg ? <SvgXml xml={info.qrSvg} width={240} height={240} /> : null}</View>
        <Text style={type.small}>Dieser QR-Code enthält ausschließlich die Server-Adresse.</Text>
        {Platform.OS === 'web' ? <BlockButton label="Server-Adresse kopieren" variant="line" onPress={() => void copy(info.url)} /> : null}
      </Section>
      <Section title="MCP · Mit Claude und anderen KI-Clients verbinden">
        <Text style={type.body}>Der MCP-Server macht dein Archiv für deinen KI-Client nutzbar: Nachrichten suchen, Kontext abrufen, Erinnerungen speichern und freigegebene WhatsApp-Aktionen ausführen.</Text>
        <Text style={type.body}>Füge diese Adresse als MCP-Connector in deinem Client hinzu. Melde dich auf der Jarvis-Anmeldeseite mit deinem Passwort an und bestätige die Verbindung.</Text>
        <Text selectable style={type.body}>{info.url}/mcp</Text>
        {Platform.OS === 'web' ? <BlockButton label="MCP-Adresse kopieren" variant="line" onPress={() => void copy(`${info.url}/mcp`)} /> : null}
        <Notice level="info" text="Cloudbasierte Clients benötigen eine öffentlich erreichbare HTTPS-Adresse. Dein Client muss die MCP-Anmeldung per OAuth unterstützen. Welche Aktionen erlaubt sind, legst du unter Einstellungen fest." />
        <Text style={type.small}>Verbundene Geräte und KI-Clients kannst du unter System → Geräte widerrufen.</Text>
      </Section>
    </>}
  </>
}
