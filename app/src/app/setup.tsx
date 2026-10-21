// One resumable first-run flow, shared by the installer and Docker Compose.
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SvgXml } from 'react-native-svg'
import type { AdminState, ConnectionInfo, Job, SettingsResponse, SetupProgress, WaLink } from '@/api/admin'
import { BlockButton, Field, Notice, Press, Seg, Toggle } from '@/components/ui'
import { JarvisFigure } from '@/components/jarvis/JarvisFigure'
import { SetupTask } from '@/components/system/SetupTask'
import { previousSetupStep, setupTaskFailure } from '@/api/setup-task'
import { JarvisError } from '@/api/http'
import { SettingInput } from '@/components/system/SettingInput'
import { useWide } from '@/components/useWide'
import { useSession } from '@/state/session'
import { getItem, setItem } from '@/state/storage'
import { errorText } from '@/i18n/format'
import { colors, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

const STEPS = ['name', 'account', 'source', 'whatsapp', 'settings', 'remote', 'done'] as const
const LABELS = ['Benennen', 'Passwort', 'Quelle', 'WhatsApp', 'Einstellungen', 'Fernzugriff', 'Fertig']
const EMPTY: SetupProgress = { revision: 0, step: 'name', furthest: 0, complete: false, draft: {} }
const SETTINGS_KEYS = ['OWNER_NAME', 'ORGANIZER_EXCLUDE_NAMES', 'ORGANIZER_REDACT', 'OPENAI_API_KEY', 'TRANSCRIBE_PROVIDER', 'IMAGE_DESCRIBE', 'EMBED_PROVIDER', 'ORGANIZER_ENABLED']
const REMOTE_KEYS = ['APP_HOME_URL', 'APP_PUBLIC_URL', 'CLOUDFLARE_TUNNEL_TOKEN']
const NAME_KEY = 'jarvis.setup.name'

export default function Setup() {
  const { admin, adminChecked } = useSession()
  const router = useRouter()
  const wide = useWide()
  const [state, setState] = useState<AdminState | null>(null)
  const [progress, setProgress] = useState<SetupProgress>(EMPTY)
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [name, setName] = useState('Jarvis')
  const [step, setStep] = useState<SetupProgress['step']>('name')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [source, setSource] = useState('whatsapp')
  const [remote, setRemote] = useState('local')
  const [consent, setConsent] = useState(false)
  const [wa, setWa] = useState<WaLink | null>(null)
  const [phone, setPhone] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [connection, setConnection] = useState<ConnectionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedJob, setFailedJob] = useState<Job | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [needsReload, setNeedsReload] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const actionLock = useRef(false)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const index = STEPS.indexOf(step)
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }) }, [step, job?.id, failedJob?.id])

  const load = async () => {
    if (!admin) return
    const s = await admin.state()
    setState(s)
    if (s.loggedIn) {
      const [p, fields] = await Promise.all([admin.progress(), admin.settings()])
      setProgress(p)
      setStep(p.step)
      setName(p.draft.ASSISTANT_NAME || fields.values.ASSISTANT_NAME || 'Jarvis')
      setSource(p.draft.source || 'whatsapp')
      setRemote(p.draft.remote || (fields.values.APP_PUBLIC_URL ? 'existing' : 'local'))
      setSettings(fields)
      setChanges((existing) => ({ ...Object.fromEntries(Object.entries(p.draft).filter(([key]) => ['OWNER_NAME', 'ORGANIZER_EXCLUDE_NAMES', 'APP_PUBLIC_URL'].includes(key))), ...existing }))
      setJob(s.job ?? null)
      setFailedJob(null)
      setNeedsReload(false)
    }
  }
  useEffect(() => {
    void getItem(NAME_KEY).then(async (v) => { if (v) setName(v); await load() }).catch((e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  useEffect(() => {
    if (!admin || !state?.loggedIn || step !== 'whatsapp') return
    let active = true
    const tick = async () => {
      try { const w = await admin.wa(); if (active) setWa(w) }
      catch (e) { if (active) setError(errorText(e)) }
    }
    void tick()
    const timer = setInterval(() => void tick(), 2500)
    return () => { active = false; clearInterval(timer) }
  }, [admin, state?.loggedIn, step])

  useEffect(() => {
    if (step !== 'done' || !admin || !state?.loggedIn) return
    void admin.connection().then(setConnection).catch((e) => setError(errorText(e)))
  }, [step, admin, state?.loggedIn])

  const act = async (fn: () => Promise<void>) => {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true); setError(null); setMessage(null); setFieldErrors({})
    try { await fn() } catch (e) {
      if (e instanceof JarvisError && e.status === 401) { setJob(null); await load() }
      else if (e instanceof JarvisError && e.status === 409) {
        setNeedsReload(true)
        setError('Die Einrichtung wurde in einem anderen Fenster geändert oder dort gestartet. Lade den aktuellen Stand, bevor du weitermachst.')
      } else if (e instanceof JarvisError && (e.code === 'network' || e.code === 'timeout')) {
        setError('Dein Server ist gerade nicht erreichbar. Prüfe deine Verbindung und lade den aktuellen Stand. Deine Eingaben bleiben in diesem Fenster erhalten.')
        setNeedsReload(true)
      } else setError(errorText(e))
    } finally { actionLock.current = false; setBusy(false) }
  }
  const draft = () => ({ ...progress.draft, ...Object.fromEntries(Object.entries(changes).filter(([k]) => ['OWNER_NAME', 'ORGANIZER_EXCLUDE_NAMES', 'APP_PUBLIC_URL'].includes(k))), ASSISTANT_NAME: name.trim(), source, remote, pendingJobId: '' })
  const save = async (to: SetupProgress['step'], complete = false, from = progress, overrides: Record<string, string> = {}) => {
    if (!admin) return
    const p = await admin.saveProgress({ ...from, step: to, complete, draft: { ...draft(), ...overrides } })
    setProgress(p); setStep(to); setError(null); setFailedJob(null); setFieldErrors({})
  }
  const field = (key: string) => {
    const f = settings?.fields.find((v) => v.key === key)
    if (!f) return null
    return <SettingInput key={key} f={f} value={changes[key] ?? (f.type === 'secret' ? '' : settings?.values[key] || f.default)} secret={settings?.secrets[key]} error={fieldErrors[key]} onChange={(v) => setChanges((c) => ({ ...c, [key]: v }))} />
  }
  const apply = async (values: Record<string, string>) => {
    if (!admin) return
    const valuesWithName = { ASSISTANT_NAME: name.trim(), ...values }
    const current = await admin.state()
    setState(current)
    const preview = await admin.preview(valuesWithName, !current.initialized)
    const problems = [...Object.values(preview.errors), ...preview.checks.filter((c) => c.level === 'error').map((c) => c.message)]
    if (problems.length) { setFieldErrors(preview.errors); throw new Error('Bitte überprüfe deine Eingaben. ' + preview.checks.filter((c) => c.level === 'error').map((c) => c.message).join(' ')) }
    setJob(await admin.apply(valuesWithName, !current.initialized))
  }
  const next = async (from = progress) => {
    if (!admin) return
    if (step === 'name') {
      if (!name.trim() || name.trim().length > 40 || !/^[\p{L}\p{N} .-]+$/u.test(name.trim())) { setFieldErrors({ name: 'Bitte wähle einen Namen mit bis zu 40 Zeichen (Buchstaben, Ziffern, Punkt oder Bindestrich).' }); return }
      await setItem(NAME_KEY, name.trim())
      if (state?.loggedIn) await save('account')
      else setStep('account')
    } else if (step === 'account') {
      if (!state?.loggedIn) {
        if (password.length < 15 || password.length > 200) { setFieldErrors({ password: 'Bitte wähle ein Passwort mit 15 bis 200 Zeichen.' }); return }
        if (password !== repeat) { setFieldErrors({ repeat: 'Die Passwörter stimmen noch nicht überein.' }); return }
        await admin.setup('', password)
        setPassword(''); setRepeat('')
        setState(await admin.state())
        const p = await admin.progress()
        if (p.complete) { setProgress({ ...p, step: 'done' }); setStep('done'); setSettings(await admin.settings()); return }
        const account = await admin.saveProgress({ ...p, step: 'account', draft: draft() })
        setSettings(await admin.settings())
        await save('source', false, account)
      } else await save('source', false, from)
    } else if (step === 'source') {
      if (source === 'whatsapp' && !consent) throw new Error('Bitte bestätige zuerst die Hinweise zur WhatsApp-Verbindung.')
      await save('source', false, from)
      await apply(state?.initialized ? {} : { REQUIRE_CONFIRM: 'true' })
    } else if (step === 'whatsapp') {
      if (source === 'whatsapp' && wa?.state !== 'open') throw new Error('WhatsApp ist noch nicht verbunden. Scanne den Code oder wähle „Später verbinden“.')
      await save('settings', false, from)
    } else if (step === 'settings') {
      if (!changes.OPENAI_API_KEY && !settings?.secrets.OPENAI_API_KEY?.set) throw new Error(`${name} arbeitet mit KI. Bitte trage deinen API-Schlüssel ein.`)
      const selected = Object.fromEntries(Object.entries(changes).filter(([key]) => SETTINGS_KEYS.includes(key)))
      if (settings?.values.ORGANIZER_ENABLED !== 'true' && selected.ORGANIZER_ENABLED === undefined) selected.ORGANIZER_ENABLED = 'true'
      await apply(selected)
    } else if (step === 'remote') {
      const url = changes.APP_PUBLIC_URL ?? settings?.values.APP_PUBLIC_URL ?? ''
      if (remote !== 'local') {
        let u: URL
        try { u = new URL(url) } catch { throw new Error('Bitte gib eine vollständige Adresse ein, zum Beispiel https://jarvis.deine-domain.de.') }
        if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Bitte gib eine HTTPS-Server-Adresse ohne Pfad ein.')
        if (remote === 'cloudflare' && !changes.CLOUDFLARE_TUNNEL_TOKEN && !settings?.secrets.CLOUDFLARE_TUNNEL_TOKEN?.set) throw new Error('Bitte füge den Tunnel-Token ein.')
      }
      await save('remote', false, from)
      const selected = Object.fromEntries(Object.entries(changes).filter(([key]) => REMOTE_KEYS.includes(key)))
      await apply({ ...selected, APP_PUBLIC_URL: remote === 'local' ? '' : url, MCP_PUBLIC_HOST: remote === 'local' ? '' : new URL(url).hostname, ...(remote === 'cloudflare' ? (changes.CLOUDFLARE_TUNNEL_TOKEN ? { CLOUDFLARE_TUNNEL_TOKEN: changes.CLOUDFLARE_TUNNEL_TOKEN } : {}) : { CLOUDFLARE_TUNNEL_TOKEN: '' }) })
    } else {
      if (!progress.complete) await save('done', true)
      router.replace('/connect')
    }
  }
  const onJobEnd = async (j: Job) => {
    setJob(null)
    if (!admin) return
    if (j.status !== 'ok') { setFailedJob(j); return }
    await act(async () => {
      const s = await admin.state(); setState(s)
      const latest = await admin.progress(); setProgress(latest)
      setSettings(await admin.settings()); setChanges((values) => Object.fromEntries(Object.entries(values).filter(([key]) => !(step === 'settings' ? SETTINGS_KEYS : step === 'remote' ? REMOTE_KEYS : []).includes(key))))
      if (step === 'source') {
        const linked = await admin.wa().catch(() => null)
        await save('whatsapp', false, latest)
        if (source === 'later' || linked?.state === 'open') {
          const current = await admin.progress()
          await save('settings', false, current)
        }
      }
      else if (step === 'settings') await save('remote', false, latest)
      else if (step === 'remote') {
        if (remote !== 'local') {
          try { await admin.checkRemote() } catch { throw new Error('Die Adresse ist noch nicht erreichbar oder zeigt nicht auf diesen Server. Prüfe deine Angaben oder wähle vorerst dein Heimnetz. Dein lokaler Zugang funktioniert weiterhin.') }
        }
        await save('done', true, latest)
      }
    })
  }

  if (!adminChecked) return <View style={st.loading}><Text style={type.body}>{error || 'Einrichtung wird geladen …'}</Text>{error ? <BlockButton label="Erneut versuchen" onPress={() => void act(load)} /> : null}</View>
  if (!admin) return <View style={st.loading}><Notice level="error" text="Öffne die Server-Adresse im Browser, um Jarvis einzurichten." /></View>
  if (!state) return <View style={st.loading}><Text style={type.body}>{error || 'Einrichtung wird geladen …'}</Text><BlockButton label="Erneut versuchen" onPress={() => void act(load)} /></View>
  if (state.configured && !state.loggedIn) return (
    <ScrollView contentContainerStyle={st.login} keyboardShouldPersistTaps="handled">
      <Text style={type.h1}>Einrichtung fortsetzen</Text>
      <Text style={type.body}>Dein Passwort schützt die Einrichtung. Bereits bestätigte Schritte bleiben gespeichert.</Text>
      <Field label="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void act(async () => { await admin.login(password); setPassword(''); await load() })} />
      {error ? <Notice level="error" text={error} /> : null}
      <BlockButton label="Anmelden" busy={busy} onPress={() => void act(async () => { await admin.login(password); setPassword(''); await load() })} />
    </ScrollView>
  )
  if (progress.complete && step !== 'done') return <View style={st.login}><Text style={type.h1}>Die Einrichtung ist abgeschlossen.</Text><BlockButton label="Zur Anmeldung" onPress={() => router.replace('/connect')} /></View>

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: layout.gutter, paddingTop: 36, paddingBottom: 60 }}>
        <View style={[st.shell, wide && { flexDirection: 'row', gap: 64 }]}>
          {wide ? <View style={st.rail}>
            <Text style={[type.cardTitle, { marginBottom: 24 }]}>{name}</Text>
            {STEPS.map((s, n) => <Press key={s} accessibilityRole="button" accessibilityState={{ selected: s === step, disabled: (s === 'whatsapp' && source === 'later') || n > (state.loggedIn ? progress.furthest : index) || !!job || !!failedJob || progress.complete }} disabled={(s === 'whatsapp' && source === 'later') || n > (state.loggedIn ? progress.furthest : index) || !!job || !!failedJob || progress.complete || busy || (!state.loggedIn && n > index)} onPress={() => void act(async () => { if (state.loggedIn) await save(s); else setStep(s) })} style={() => ({ paddingVertical: 14, opacity: n > Math.max(progress.furthest, index) ? 0.45 : 1 })}><Text style={[type.body, { color: s === step ? colors.ink : colors.ink2 }]}>{n + 1} · {LABELS[n]}</Text></Press>)}
          </View> : <Text style={type.small}>Schritt {index + 1} von {STEPS.length} · {LABELS[index]}</Text>}
          <View style={st.content}>
            <View style={{ alignItems: 'flex-start' }}><JarvisFigure state={job || busy ? 'thinking' : step === 'done' ? 'happy' : 'idle'} size={110} /></View>
            {!job && !failedJob ? <>
            {step === 'name' ? <>
              <Text style={type.h1} accessibilityRole="header">Wie soll dein Assistent heißen?</Text>
              <Text style={type.body}>Dein privater Kontext-Manager läuft auf deinem eigenen Rechner. Du richtest ihn einmal ein und nutzt ihn im Browser oder in der Mobile App.</Text>
              <Field label="Name des Assistenten" error={fieldErrors.name} value={name} onChangeText={setName} maxLength={40} autoFocus />
            </> : null}
            {step === 'account' ? <>
              <Text style={type.h1} accessibilityRole="header">Dein Zugang zu {name}</Text>
              {state.loggedIn ? <Notice level="ok" text="Dein Passwort ist eingerichtet. Es gilt für Web, Mobile und Verwaltung." /> : <>
                <Text style={type.body}>Wer hier zuerst ein Passwort festlegt, wird Besitzer dieser Installation. Wähle dein eigenes Passwort für Web, Mobile und Verwaltung.</Text>
                <Field label="Dein Passwort" error={fieldErrors.password} help="15 bis 200 Zeichen. Eine lange Passphrase ist gut merkbar. Passwortmanager werden unterstützt." value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} />
                <Field label="Passwort wiederholen" error={fieldErrors.repeat} value={repeat} onChangeText={setRepeat} secureTextEntry={!showPassword} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} />
                <Toggle label="Passwort anzeigen" value={showPassword} onChange={setShowPassword} />
              </>}
            </> : null}
            {step === 'source' ? <>
              <Text style={type.h1} accessibilityRole="header">Was möchtest du verbinden?</Text>
              <Text style={type.body}>Aktuell kannst du WhatsApp verbinden. Weitere Quellen lassen sich später ergänzen.</Text>
              <Seg items={[{ key: 'whatsapp', label: 'WhatsApp', on: source === 'whatsapp', onPress: () => setSource('whatsapp') }, { key: 'later', label: 'Später verbinden', on: source === 'later', onPress: () => setSource('later') }]} />
              {source === 'whatsapp' ? <>
                <Notice level="warn" text="Jarvis nutzt eine inoffizielle WhatsApp-Anbindung. WhatsApp unterstützt diese Nutzung nicht offiziell; eine Einschränkung oder Sperre des Kontos ist möglich." />
                <Text style={type.body}>Nachrichten und Metadaten werden auf deinem Server archiviert. Den KI-Anbieter richtest du gleich ein. Wie viel Verlauf importiert wird, bestimmt WhatsApp.</Text>
                <Toggle label="Ich habe die Hinweise gelesen und möchte WhatsApp verbinden" value={consent} onChange={setConsent} />
              </> : null}
              <Text style={type.small}>Als Nächstes werden die Basisdienste eingerichtet. Das kann beim ersten Mal einige Minuten dauern.</Text>
            </> : null}
            {step === 'whatsapp' ? <>
              <Text style={type.h1} accessibilityRole="header">WhatsApp verbinden</Text>
              {source === 'later' ? <Notice level="info" text="Du kannst WhatsApp später unter Verbindungen einrichten." /> : <>
                <Text style={type.body}>Öffne WhatsApp auf deinem Handy → Einstellungen oder Menü → Verknüpfte Geräte → Gerät hinzufügen. Scanne dann diesen QR-Code.</Text>
                <View style={{ alignItems: 'center' }} accessibilityLiveRegion="polite">
                  {wa?.qrSvg ? <SvgXml xml={wa.qrSvg} width={240} height={240} /> : null}
                  {wa?.pairingCode ? <Text selectable style={type.h1}>{wa.pairingCode}</Text> : null}
                  <Text style={type.body}>{wa?.state === 'open' ? 'WhatsApp ist verbunden.' : wa?.expired ? 'Der Code ist abgelaufen. Ein neuer Code erscheint automatisch.' : wa?.qrSvg ? 'Der Code wird automatisch erneuert.' : 'Warte auf WhatsApp …'}</Text>
                </View>
                {wa?.error ? <Notice level="warn" text={wa.error} /> : null}
                <Field label="Alternativ: Telefonnummer mit Ländervorwahl" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="49151…" />
                <BlockButton label={phone ? 'Kopplungscode anfordern' : 'Neuen QR-Code anfordern'} variant="line" busy={busy || !!job} onPress={() => void act(async () => { setJob(await admin.relink('NEU VERKNÜPFEN', phone || undefined)) })} />
                {wa?.pairingCode ? <Text style={type.small}>Wähle auf dem Handy „Stattdessen mit Telefonnummer verknüpfen“ und gib diesen Code ein.</Text> : null}
                <BlockButton label="Später verbinden" variant="line" disabled={!!job} onPress={() => void act(async () => { setSource('later'); await save('settings', false, progress, { source: 'later' }) })} />
              </>}
            </> : null}
            {step === 'settings' ? <>
              <Text style={type.h1} accessibilityRole="header">Verbinde die KI von {name}</Text>
              <Text style={type.body}>{name} ist ein KI-Assistent: Er versteht deine Nachrichten, sortiert sie nach Themen, transkribiert Sprachnachrichten und beantwortet deine Fragen. Dafür braucht er einen KI-Anbieter. Aktuell wird OpenAI unterstützt.</Text>
              {field('OWNER_NAME')}
              <Notice level="info" text="Dabei werden Texte, Audios und Bilder an den Anbieter übertragen und es entstehen API-Kosten. Chat-Ausschlüsse gelten für Suche und Themen-Sortierung, nicht automatisch für Audio und Bilder. Lege unten fest, was nie an die KI gehen darf." />
              {field('OPENAI_API_KEY')}
              <BlockButton label="API-Schlüssel prüfen" variant="line" busy={busy} onPress={() => void act(async () => { const r = await admin.testOpenAi(changes.OPENAI_API_KEY || undefined); if (!r.ok) throw new Error(r.message); setMessage(r.message) })} />
              {field('ORGANIZER_EXCLUDE_NAMES')}{field('ORGANIZER_REDACT')}
              <Text style={type.small}>Weitere Einstellungen wie Transkription, Bildbeschreibung und Themen-Sortierung stehen auf sinnvollen Werten und lassen sich später unter Einstellungen ändern.</Text>
            </> : null}
            {step === 'remote' ? <>
              <Text style={type.h1} accessibilityRole="header">Wo möchtest du {name} nutzen?</Text>
              <Text style={type.body}>Für den Anfang empfehlen wir dein Heimnetz. Du kannst den Zugang für unterwegs jederzeit später einrichten.</Text>
              <Seg items={[{ key: 'local', label: 'Heimnetz', on: remote === 'local', onPress: () => setRemote('local') }, { key: 'cloudflare', label: 'Cloudflare', on: remote === 'cloudflare', onPress: () => setRemote('cloudflare') }, { key: 'existing', label: 'Eigene Adresse', on: remote === 'existing', onPress: () => setRemote('existing') }]} />
              {remote === 'local' ? <>
                <Text style={type.body}>Deine Geräte erreichen den Server im gleichen Heimnetz. Unterwegs brauchst du später einen Fernzugriff oder ein VPN. HTTP im Heimnetz ist unverschlüsselt.</Text>
                {field('APP_HOME_URL')}
                <Text style={type.small}>Leer lassen: Jarvis ermittelt die Heimnetz-Adresse automatisch. Falls dein Server mehrere Netze hat, kannst du die passende Adresse hier angeben.</Text>
              </> : <>
                <Notice level="warn" text="Über diese Adresse sind nach Anmeldung auch Einstellungen und Wartung erreichbar. Dein Passwort schützt damit die gesamte Installation. Cloudflare vermittelt beim Tunnel den Datenverkehr." />
                {remote === 'cloudflare' ? <>
                  <Text style={type.body}>1. Melde dich bei Cloudflare an und verwende eine dort verwaltete Domain.</Text>
                  <BlockButton label="Cloudflare-Anleitung öffnen" variant="line" onPress={() => void Linking.openURL('https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/')} />
                  <Text style={type.body}>2. Erstelle einen Cloudflared-Tunnel. Kopiere dessen Token hierher; du musst den Installationsbefehl von Cloudflare nicht ausführen.</Text>
                  {field('CLOUDFLARE_TUNNEL_TOKEN')}
                  <Text style={type.body}>3. Lege eine veröffentlichte Anwendungsroute an. Als Dienst wählst du HTTP und trägst app-web:8084 ein. Diese Adresse ist nur innerhalb von Docker erreichbar.</Text>
                </> : <Text style={type.body}>Leite deine HTTPS-Adresse auf den Web-Einstieg von Jarvis weiter (lokaler Port 8081). Verwende dieselbe Adresse für Web und Mobile.</Text>}
                {field('APP_PUBLIC_URL')}
                <Text style={type.small}>Beim Weitergehen startet Jarvis den Zugang und prüft, ob die Adresse tatsächlich auf diesen Server zeigt.</Text>
                <BlockButton label="Vorerst nur im Heimnetz nutzen" variant="line" onPress={() => { setRemote('local'); setError(null) }} />
              </>}
            </> : null}
            {step === 'done' ? <>
              <Text style={type.h1} accessibilityRole="header">{name} ist bereit.</Text>
              <Text style={type.body}>Im Browser meldest du dich direkt mit deinem Passwort an. In der Mobile App scannst du zuerst diesen Code oder gibst die Server-Adresse ein und meldest dich danach an.</Text>
              {connection ? <>
                {connection.localOnly ? <Notice level="warn" text="Diese Adresse funktioniert nur auf dem Server selbst. Trage unter System → Einstellungen → Zugang & Fernzugriff eine Heimnetz-Adresse ein, bevor du die Mobile App verbindest." /> : null}
                <Text selectable style={type.body}>{connection.url}</Text>
                <View style={{ alignItems: 'center' }}>{connection.qrSvg ? <SvgXml xml={connection.qrSvg} width={240} height={240} /> : null}</View>
                <Text style={type.small}>Der QR-Code enthält nur die Server-Adresse, kein Passwort und keinen Anmeldetoken.</Text>
                {Platform.OS === 'web' ? <BlockButton label="Server-Adresse kopieren" variant="line" onPress={() => void act(async () => { await navigator.clipboard.writeText(connection.url); setMessage('Adresse kopiert.') })} /> : null}
              </> : null}
              <View style={{ gap: 12, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.line }}>
                <Text style={type.cardTitle}>Mit Claude und anderen KI-Clients verbinden</Text>
                <Text style={type.body}>{name} bringt einen MCP-Server mit. Damit kann dein KI-Client in deinem Archiv suchen, Kontext abrufen und freigegebene Aktionen ausführen. Verbinde ihn über diese Adresse und melde dich mit deinem Passwort an.</Text>
                <Text selectable style={type.body}>{connection ? `${connection.url}/mcp` : ''}</Text>
                {remote === 'local' ? <Notice level="info" text="Cloudbasierte Clients wie Claude benötigen eine von außen erreichbare HTTPS-Adresse. Du kannst den Fernzugriff später einrichten." /> : null}
                <Text style={type.small}>Diese Verbindung findest du später unter System → Verbindungen wieder.</Text>
              </View>
            </> : null}
            </> : null}
            {job ? <SetupTask key={job.id} admin={admin} job={job} onEnd={onJobEnd} onSessionExpired={() => { setJob(null); void act(load) }} /> : null}
            {failedJob ? <View style={{ gap: 20 }}>
              <Text style={type.h1} accessibilityRole="header">{setupTaskFailure(failedJob).title}</Text>
              <Text style={type.body}>{setupTaskFailure(failedJob).message}</Text>
              <Text style={type.small}>Du bist weiterhin im Schritt „{LABELS[index]}“. Du musst nicht von vorne anfangen.</Text>
              <BlockButton label="Erneut versuchen" busy={busy} onPress={() => void act(async () => { const p = await admin.progress(); setProgress(p); await save(step, false, p); await next(await admin.progress()) })} />
              <BlockButton label="Eingaben überprüfen" variant="line" busy={busy} onPress={() => void act(async () => { const p = await admin.progress(); await save(step, false, p) })} />
            </View> : null}
            {error ? <View accessibilityRole="alert"><Notice level="error" text={error} /></View> : null}
            {message ? <Notice level="ok" text={message} /> : null}
            {needsReload ? <BlockButton label="Aktuellen Stand laden" busy={busy} onPress={() => void act(load)} /> : null}
            {!job && !failedJob ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              {index > 0 && !progress.complete ? <BlockButton label="Zurück" variant="line" disabled={busy || !!job} style={{ flex: 1 }} onPress={() => void act(async () => { setError(null); setMessage(null); const to = previousSetupStep(step, source); if (state.loggedIn) await save(to); else setStep(to) })} /> : null}
              <BlockButton label={step === 'done' ? 'Weboberfläche öffnen' : step === 'source' ? (state.initialized ? 'Auswahl übernehmen' : 'Jarvis einrichten') : step === 'account' ? (state.loggedIn ? 'Weiter' : 'Passwort speichern') : step === 'whatsapp' ? 'Verbindung übernehmen' : step === 'settings' ? (Object.keys(changes).length ? 'Einstellungen speichern' : 'Mit Grundeinstellungen weiter') : step === 'remote' ? (remote === 'local' ? 'Einrichtung abschließen' : 'Adresse prüfen und abschließen') : 'Weiter'} busy={busy || !!job} disabled={needsReload} style={{ flex: 2 }} onPress={() => void act(() => next())} />
            </View> : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
const st = StyleSheet.create({
  shell: { width: '100%', maxWidth: 960, alignSelf: 'center', gap: 24 },
  rail: { width: 200, paddingTop: 30 },
  content: { flex: 1, minWidth: 0, width: '100%', maxWidth: 560, alignSelf: 'center', gap: 20 },
  loading: { flex: 1, justifyContent: 'center', padding: 24, gap: 20, backgroundColor: colors.ground },
  login: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, paddingTop: 80, gap: 24 },
})
