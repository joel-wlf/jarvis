// In-memory admin API for mock mode. Field labels mirror admin/src/schema.ts (server content, German).
import type { AdminApi, AdminState, Job, SettingsField, SettingsGroup, StatusResponse, WaLink } from './admin'
import { JarvisError } from './http'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

const GROUPS: SettingsGroup[] = [
  { id: 'general', label: 'Allgemein', icon: 'user', help: 'Wer du bist und wie Jarvis dich nennt.' },
  { id: 'access', label: 'Zugang & Fernzugriff', icon: 'key', help: 'Token für Claude, Cloudflare-Tunnel und Datenbank-Passwörter.' },
  { id: 'ai', label: 'KI-Anbieter', icon: 'spark', help: 'OpenAI-Schlüssel für Transkription, Bedeutungssuche, Bilder und Themen-Sortierung.' },
  { id: 'privacy', label: 'Datenschutz', icon: 'shield', help: 'Was nie an die KI geht und was vorher geschwärzt wird.' },
  { id: 'organizer', label: 'Themen-Sortierung', icon: 'layers', help: 'Organizer: bündelt Nachrichten zu Themen, Terminen und Aufgaben.' },
  { id: 'actions', label: 'Aktionen & Gedächtnis', icon: 'send', help: 'Was Claude in WhatsApp tun darf.' },
]

const FIELDS: SettingsField[] = [
  { key: 'OWNER_NAME', group: 'general', type: 'text', default: '', label: 'Dein Name', help: 'So spricht Jarvis in Anweisungen, Zusammenfassungen und Profilen von dir.', services: ['mcp-server', 'organizer'], placeholder: 'z.B. Alex', maxLength: 40 },
  { key: 'OWN_NAMES', group: 'general', type: 'list', default: '', label: 'Weitere eigene Namen', help: 'Spitznamen oder Schreibweisen, mit denen andere dich ansprechen.', services: ['organizer'], placeholder: 'z.B. Alex,Lexi' },
  { key: 'MCP_PUBLIC_HOST', group: 'access', type: 'text', default: '', label: 'Öffentlicher Hostname', help: 'Der Hostname, den du im Cloudflare-Tunnel für den MCP-Server eingetragen hast.', services: [], placeholder: 'jarvis.example.com', adminOnly: true },
  { key: 'CLOUDFLARE_TUNNEL_TOKEN', group: 'access', type: 'secret', default: '', label: 'Cloudflare-Tunnel-Token', help: 'Macht Jarvis von unterwegs erreichbar, ohne Ports zu öffnen.', services: ['cloudflared'] },
  { key: 'OPENAI_API_KEY', group: 'ai', type: 'secret', default: '', label: 'OpenAI-Schlüssel', help: 'Optional. Ohne Schlüssel läuft alles lokal und langsamer, die Themen-Sortierung ist aus.', services: ['wa-ingest', 'embedder', 'organizer'] },
  { key: 'REDACT_NUMBERS', group: 'privacy', type: 'bool', default: 'true', label: 'Telefonnummern schwärzen', help: 'Nummern werden ersetzt, bevor Text an die KI geht.', services: ['organizer'] },
  { key: 'ORGANIZER_EXCLUDE_NAMES', group: 'privacy', type: 'list', default: '', label: 'Nie an die KI', help: 'Chats mit diesen Namen werden nie sortiert oder zusammengefasst.', services: ['organizer'], placeholder: 'z.B. Arzt,Bank' },
  { key: 'ORGANIZER_ENABLED', group: 'organizer', type: 'bool', default: 'false', label: 'Themen-Sortierung an', help: 'Braucht einen OpenAI-Schlüssel.', services: ['organizer'] },
  { key: 'ORGANIZER_INTERVAL_MIN', group: 'organizer', type: 'int', default: '15', min: 5, max: 240, label: 'Intervall in Minuten', help: 'Wie oft neue Nachrichten sortiert werden.', services: ['organizer'] },
  { key: 'REQUIRE_CONFIRM', group: 'actions', type: 'bool', default: 'true', label: 'Senden bestätigen', help: 'Claude fragt vor jedem Senden nach.', services: ['mcp-server'] },
  { key: 'ACTIONS_PER_HOUR', group: 'actions', type: 'int', default: '20', min: 1, max: 200, label: 'Aktionen pro Stunde', help: 'Obergrenze für gesendete Nachrichten, Reaktionen und Abstimmungen.', services: ['wa-ingest'] },
]

export function createMockAdmin(): AdminApi {
  const values: Record<string, string> = { OWNER_NAME: 'Alex', OWN_NAMES: 'Lexi', MCP_PUBLIC_HOST: 'jarvis.example.com', REDACT_NUMBERS: 'true', ORGANIZER_EXCLUDE_NAMES: '', ORGANIZER_ENABLED: 'true', ORGANIZER_INTERVAL_MIN: '15', REQUIRE_CONFIRM: 'true', ACTIONS_PER_HOUR: '20' }
  const secrets: Record<string, { set: boolean; hint?: string }> = { CLOUDFLARE_TUNNEL_TOKEN: { set: true, hint: '…a91f' }, OPENAI_API_KEY: { set: true, hint: '…7Qx2' } }
  // initialized: false so the setup wizard can be walked through in mock mode.
  const state: AdminState = { configured: true, loggedIn: false, envExists: true, initialized: false, envProblem: null, fake: true, job: null }
  const jobs = new Map<string, Job>()
  let n = 0

  const run = (kind: string, title: string, steps: string[]): Job => {
    const job: Job = { id: `job${++n}`, kind, title, status: 'running', startedAt: iso(0), lines: [] }
    jobs.set(job.id, job)
    steps.forEach((msg, i) => setTimeout(() => job.lines!.push({ t: new Date().toISOString(), level: i === steps.length - 1 ? 'ok' : 'info', msg }), 500 * (i + 1)))
    setTimeout(() => {
      job.status = 'ok'
      job.endedAt = new Date().toISOString()
    }, 500 * steps.length + 200)
    return { ...job, lines: [] }
  }
  const guard = () => {
    if (!state.loggedIn) throw new JarvisError('unauthorized', 'Bitte anmelden.', 401)
  }
  const wa: WaLink = { state: 'open', at: iso(1), user: '4917…321' }

  return {
    healthy: async () => true,
    state: async () => ({ ...state }),
    async setup() {
      await wait(300)
      state.configured = true
      state.loggedIn = true
    },
    async login(password) {
      await wait(300)
      if (!password) throw new JarvisError('unauthorized', 'Passwort falsch.', 401)
      state.loggedIn = true
    },
    async logout() {
      state.loggedIn = false
    },
    setupInfo: async () => ({ pgdataExists: true, waAuthExists: true }),
    async settings() {
      guard()
      await wait(200)
      return { groups: GROUPS, fields: FIELDS, exists: true, values: { ...values }, secrets: { ...secrets }, unknown: [], profiles: 'organizer,tunnel', transcribeMode: 'openai', checks: [] }
    },
    async preview(changes) {
      guard()
      await wait(250)
      const errors: Record<string, string> = {}
      const diff = Object.entries(changes)
        .filter(([k, v]) => (FIELDS.find((f) => f.key === k)?.type === 'secret' ? !!v : (values[k] ?? '') !== v))
        .map(([key, to]) => {
          const f = FIELDS.find((x) => x.key === key)
          if (f?.type === 'int' && (!/^\d+$/.test(to) || (f.min !== undefined && +to < f.min) || (f.max !== undefined && +to > f.max))) errors[key] = `Zahl zwischen ${f.min} und ${f.max}`
          return f?.type === 'secret' ? { key, from: secrets[key]?.hint ?? '', to: 'neu' } : { key, from: values[key] ?? '', to }
        })
      const services = [...new Set(diff.flatMap((d) => FIELDS.find((f) => f.key === d.key)?.services ?? []))]
      return { errors, checks: changes.ORGANIZER_ENABLED === 'true' && !secrets.OPENAI_API_KEY?.set ? [{ level: 'warn', message: 'Die Themen-Sortierung braucht einen OpenAI-Schlüssel.', keys: ['ORGANIZER_ENABLED'] }] : [], diff, services, profiles: 'organizer,tunnel' }
    },
    async apply(changes) {
      guard()
      await wait(200)
      for (const [k, v] of Object.entries(changes)) {
        if (FIELDS.find((f) => f.key === k)?.type === 'secret') secrets[k] = { set: !!v, hint: v ? `…${v.slice(-4)}` : undefined }
        else values[k] = v
      }
      return run('apply', 'Einstellungen übernehmen', ['Sicherung der .env angelegt', 'Neue .env geschrieben', 'Konfiguration geprüft', 'Betroffene Dienste neu gestartet', 'Alle Dienste laufen'])
    },
    async job(id, since = 0) {
      const j = jobs.get(id)
      if (!j) throw new JarvisError('not_found', 'Unbekannter Vorgang.', 404)
      return { job: { ...j, lines: j.lines!.slice(since) }, total: j.lines!.length }
    },
    async status(): Promise<StatusResponse> {
      guard()
      await wait(250)
      const svc = ['postgres', 'embedder', 'wa-ingest', 'mcp-server', 'organizer', 'cloudflared', 'admin']
      return {
        services: svc.map((s) => ({ service: s, state: 'running', health: s === 'cloudflared' ? '' : 'healthy', status: 'Up 3 days' })),
        servicesError: null,
        wa,
        db: { messages: 48213, lastMessage: iso(0.05), embedPending: 0, audioPending: 1, outboxPending: 0, tokensToday: 18_400, heartbeat: iso(0.01) },
        disk: { free: 21.4e9, total: 58e9 },
        checks: [],
        profiles: 'organizer,tunnel',
        tunnel: true,
        job: null,
      }
    },
    async logs(service) {
      guard()
      await wait(300)
      const lines = Array.from({ length: 24 }, (_, i) => `${new Date(Date.now() - (24 - i) * 61_000).toISOString()} ${service} | ${['tick', 'synced 3 messages', 'embedding batch ok', 'health ok'][i % 4]}`)
      return { service, text: lines.join('\n') }
    },
    async wa() {
      guard()
      return { ...wa }
    },
    async relink(confirm) {
      guard()
      if (confirm.trim().toUpperCase() !== 'NEU VERKNÜPFEN') throw new JarvisError('invalid', 'Zur Bestätigung „NEU VERKNÜPFEN" eintippen.', 400)
      return run('relink', 'WhatsApp neu verknüpfen', ['Alte Sitzung gesichert', 'wa-ingest neu gestartet', 'Warte auf QR-Code'])
    },
    async testOpenAi(key) {
      await wait(700)
      return key && key.length < 20 ? { ok: false, message: 'Der Anbieter lehnt den Schlüssel ab (401).' } : { ok: true, message: 'Schlüssel funktioniert.' }
    },
    async backups() {
      guard()
      await wait(200)
      return [
        { name: '.env.2026-10-19T08-12-00', at: iso(40), changed: ['ORGANIZER_INTERVAL_MIN'] },
        { name: '.env.2026-10-02T21-40-11', at: iso(460), changed: ['OPENAI_API_KEY', 'ORGANIZER_ENABLED'] },
      ]
    },
    restore: async (name) => run('restore', `Sicherung ${name} wiederherstellen`, ['Sicherung gelesen', 'Dienste neu gestartet']),
    restart: async (service) => run('restart', `${service} neu starten`, [`${service} gestoppt`, `${service} gestartet`, 'Gesund']),
    rebuild: async () => run('rebuild', 'Alles neu bauen', ['Images gebaut', 'Dienste neu erstellt', 'Alle Dienste laufen']),
    estimate: async () => run('estimate', 'Kosten schätzen', ['48 213 Nachrichten gezählt', 'Geschätzt: 0,42 € für die erste Sortierung']),
    pairing: async () => ({ code: 'DEMO-1234', expiresAt: new Date(Date.now() + 600_000).toISOString(), qr: 'jarvis:{"v":1,"url":"https://jarvis.example.org","code":"DEMO-1234"}', qrSvg: DEMO_QR }),
    ownerPassword: async (_admin, pw) => {
      if (pw.length < 10) throw new Error('Das Passwort braucht mindestens 10 Zeichen.')
    },
  }
}

/** A static stand-in QR (not scannable) for the demo mode. */
const DEMO_QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path fill="#fff" d="M0 0h21v21H0z"/><path fill="#121416" d="M1 1h7v7H1zm1 1v5h5V2zm1 1h3v3H3zm10-2h7v7h-7zm1 1v5h5V2zm1 1h3v3h-3zM1 13h7v7H1zm1 1v5h5v-5zm1 1h3v3H3zm7-14h2v2h-2zm0 4h2v3h-2zm3 6h2v2h-2zm-4 1h2v2H9zm6 2h2v2h-2zm2-3h3v2h-3zm-6 5h2v3h-2zm4 1h3v2h-3z"/></svg>'
