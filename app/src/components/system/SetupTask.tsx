// First-run task screen: operational logs belong in administration, not onboarding.
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import type { AdminApi, Job } from '@/api/admin'
import { JarvisError } from '@/api/http'
import { setupTaskStage } from '@/api/setup-task'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { BlockButton, Notice } from '../ui'

const PHASES = ['Vorbereitung', 'Installation', 'Start', 'Abschluss']
const EXPLANATIONS = [
  'Wir prüfen deine Auswahl und bereiten deinen Server vor.',
  'Jarvis lädt die benötigten Bestandteile und installiert sie auf deinem Server. Auf einem Raspberry Pi kann das beim ersten Mal 10 bis 30 Minuten dauern.',
  'Wir starten Jarvis und warten, bis alle Bestandteile bereit sind.',
  'Wir prüfen, ob dein Archiv erreichbar ist. Gleich geht es weiter.',
]

export function SetupTask({ admin, job: initial, onEnd, onSessionExpired }: { admin: AdminApi; job: Job; onEnd: (job: Job) => Promise<void>; onSessionExpired: () => void }) {
  const [job, setJob] = useState(initial)
  const [offline, setOffline] = useState(false)
  const [longWait, setLongWait] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const callbacks = useRef({ onEnd, onSessionExpired })
  useEffect(() => { callbacks.current = { onEnd, onSessionExpired } }, [onEnd, onSessionExpired])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        // Request the bounded full snapshot: line offsets become invalid when the server rotates logs.
        const response = await admin.job(initial.id)
        if (!active) return
        setOffline(false)
        setJob(response.job)
        setLongWait(Date.now() - Date.parse(response.job.startedAt) > 30 * 60_000)
        if (response.job.status !== 'running') {
          await callbacks.current.onEnd(response.job)
          return
        }
      } catch (error) {
        if (!active) return
        if (error instanceof JarvisError && error.status === 401) { callbacks.current.onSessionExpired(); return }
        setOffline(true)
      }
      if (active) timer = setTimeout(() => void tick(), 2500)
    }
    void tick()
    return () => { active = false; clearTimeout(timer) }
  }, [admin, initial.id, attempt])
  const stage = setupTaskStage(job)
  return <View style={{ gap: 24 }}>
    <Text accessibilityRole="header" style={type.h1}>{offline ? 'Verbindung wird wiederhergestellt' : initial.kind === 'relink' ? 'WhatsApp wird vorbereitet' : initial.kind === 'setup' ? 'Wir richten Jarvis für dich ein' : 'Wir übernehmen deine Auswahl'}</Text>
    <Text style={type.body}>{offline ? 'Wir erreichen deinen Server gerade nicht. Die Einrichtung kann dort weiterlaufen. Sobald die Verbindung zurück ist, geht es hier weiter.' : initial.kind === 'relink' ? 'Wir bereiten einen neuen Verbindungscode vor. Halte dein Handy bereit.' : stage === 1 && initial.kind !== 'setup' ? 'Wir übernehmen deine Auswahl und starten die benötigten Bestandteile. Das kann einige Minuten dauern.' : EXPLANATIONS[stage]}</Text>
    {initial.kind !== 'relink' ? <View accessibilityRole="progressbar" accessibilityLabel="Einrichtung" accessibilityValue={{ text: offline ? 'Verbindung unterbrochen' : PHASES[stage] }} style={{ flexDirection: 'row', gap: 6 }}>
      {PHASES.map((label, i) => <View key={label} style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 6, backgroundColor: i <= stage ? colors.ink : colors.line2 }} />
        <Text style={[type.tiny, { color: i === stage ? colors.ink : colors.muted }]}>{label}</Text>
      </View>)}
    </View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ActivityIndicator color={colors.ink} /><Text style={[type.small, { flex: 1 }]} accessibilityLiveRegion="polite">{offline ? 'Verbindung wird erneut versucht …' : 'Die Einrichtung läuft. Du musst nichts tun.'}</Text></View>
    {longWait && !offline ? <Notice level="info" text="Das dauert länger als üblich. Wir warten weiter auf deinen Server. Du kannst diese Seite schließen und später zurückkommen." /> : null}
    <Text style={type.small}>Du kannst das Fenster schließen und später an dieser Stelle weitermachen. Während der Einrichtung lässt sich die Auswahl nicht ändern. Deine gespeicherten Daten werden nicht gelöscht.</Text>
    {offline ? <BlockButton label="Jetzt erneut verbinden" variant="line" onPress={() => setAttempt((n) => n + 1)} /> : null}
  </View>
}
