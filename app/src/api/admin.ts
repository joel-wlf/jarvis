// Typed client for the admin interface on the home network (admin/src/server.ts).
// The admin API uses a session cookie and requires the "X-Jarvis: 1" header on every write.
import { requestJson } from './http'
import i18n from '@/i18n'

export type JobStatus = 'running' | 'ok' | 'failed' | 'rolled_back' | 'interrupted'
export type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'out'
export interface Job {
  id: string
  kind: string
  title: string
  status: JobStatus
  startedAt: string
  endedAt?: string
  lines?: { t: string; level: LogLevel; msg: string }[]
  result?: Record<string, unknown>
}

export interface AdminState {
  assistantName?: string
  setupComplete?: boolean
  configured: boolean
  loggedIn: boolean
  envExists: boolean
  initialized: boolean
  envProblem: string | null
  fake: boolean
  job: Job | null
}

export type FieldType = 'text' | 'secret' | 'bool' | 'int' | 'float' | 'enum' | 'list' | 'phone' | 'url'
export interface SettingsGroup { id: string; label: string; icon: string; help: string }
export interface SettingsField {
  key: string
  group: string
  label: string
  help: string
  type: FieldType
  default: string
  required?: boolean
  min?: number
  max?: number
  pattern?: string
  patternHelp?: string
  maxLength?: number
  options?: { value: string; label: string }[]
  initOnly?: boolean
  generate?: 'hex24' | 'hex32'
  advanced?: boolean
  services: string[]
  placeholder?: string
  adminOnly?: boolean
  unit?: string
  /** common values offered as choices; other valid values can still be typed */
  presets?: { value: string; label: string }[]
}
export interface Check { level: 'error' | 'warn' | 'info'; message: string; keys: string[] }
export interface SettingsResponse {
  groups: SettingsGroup[]
  fields: SettingsField[]
  exists: boolean
  values: Record<string, string>
  secrets: Record<string, { set: boolean; hint?: string }>
  unknown: string[]
  profiles: string
  transcribeMode: string
  checks: Check[]
}
export interface PreviewResponse {
  errors: Record<string, string>
  checks: Check[]
  diff: { key: string; from: string; to: string }[]
  services: string[]
  profiles: string
}

export interface ServiceState { service: string; state: string; health: string; exitCode?: number; status?: string }
export interface WaLink {
  state: 'unknown' | 'starting' | 'qr' | 'pairing' | 'open' | 'closed' | 'logged_out'
  at?: string
  user?: string
  error?: string
  qrSvg?: string
  expired?: boolean
  pairingCode?: string
}
export interface DbStats {
  messages: number
  lastMessage: string | null
  embedPending: number | null
  audioPending: number | null
  outboxPending: number | null
  tokensToday: number | null
  heartbeat: string | null
}
/** One plain-language problem with the action that fixes it (admin/src/health.ts) */
export interface HealthItem {
  id: 'serviceDown' | 'serviceUnhealthy' | 'waLoggedOut' | 'waNotLinked' | 'waDisconnected' | 'diskFull' | 'diskLow' | 'updateFailed'
  level: 'error' | 'warn'
  params?: Record<string, string>
  action?: { kind: 'route'; to: string } | { kind: 'restart'; service: string }
}
export interface StatusResponse {
  /** missing on older servers */
  health?: HealthItem[]
  lastUpdate?: { status: JobStatus; at: string; updated: string[] | null } | null
  services: ServiceState[]
  servicesError: string | null
  wa: WaLink
  db: DbStats | null
  disk: { free: number; total: number } | null
  checks: Check[]
  profiles: string
  tunnel: boolean
  job: Job | null
}
export interface Backup { name: string; at: string; changed: string[] }

export const SERVICES = ['postgres', 'embedder', 'wa-ingest', 'mcp-server', 'organizer', 'cloudflared', 'admin'] as const
export const RELINK_WORD = 'NEU VERKNÜPFEN'

export interface SetupProgress {
  revision: number
  step: 'name' | 'account' | 'source' | 'whatsapp' | 'settings' | 'remote' | 'done'
  furthest: number
  complete: boolean
  draft: Record<string, string>
}
export interface ConnectionInfo { url: string; qrSvg: string; localOnly?: boolean }

/** POST /api/pairing on the admin interface: one-time code and QR for a new device. */
export interface PairingCode {
  code: string
  expiresAt: string
  qr: string
  qrSvg: string
}

export interface AdminApi {
  progress(): Promise<SetupProgress>
  saveProgress(progress: SetupProgress): Promise<SetupProgress>
  connection(): Promise<ConnectionInfo>
  checkRemote(): Promise<{ ok: boolean }>

  healthy(): Promise<boolean>
  state(): Promise<AdminState>
  setup(code: string, password: string): Promise<void>
  login(password: string): Promise<void>
  logout(): Promise<void>
  changePassword(oldPassword: string, newPassword: string): Promise<void>
  setupInfo(): Promise<{ pgdataExists: boolean; waAuthExists: boolean }>
  settings(): Promise<SettingsResponse>
  preview(changes: Record<string, string>, initial?: boolean): Promise<PreviewResponse>
  apply(changes: Record<string, string>, initial?: boolean): Promise<Job>
  job(id: string, since?: number): Promise<{ job: Job; total: number }>
  status(): Promise<StatusResponse>
  logs(service: string, tail?: number): Promise<{ service: string; text: string }>
  wa(): Promise<WaLink>
  relink(confirm: string, phone?: string): Promise<Job>
  testOpenAi(key?: string, baseUrl?: string): Promise<{ ok: boolean; message: string }>
  /** Sign in with OpenRouter: redirect = come back to /setup, otherwise OpenRouter shows a code to paste */
  openRouterStart(redirect: boolean): Promise<{ url: string; state: string }>
  /** Swap OpenRouter's one-time code for a key. The server keeps the key; the settings to apply carry a placeholder. */
  openRouterFinish(state: string, code: string): Promise<{ settings: Record<string, string> }>
  backups(): Promise<Backup[]>
  restore(name: string): Promise<Job>
  restart(service: string): Promise<Job>
  rebuild(): Promise<Job>
  estimate(): Promise<Job>
  pairing(): Promise<PairingCode>
  ownerPassword(adminPassword: string, newPassword: string): Promise<void>
}

export function createHttpAdmin(homeUrl: string, token?: string): AdminApi {
  const call = <T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, timeoutMs?: number) =>
    requestJson<T>(`${homeUrl}${path}`, { method, body: method === 'POST' ? (body ?? {}) : undefined, headers: { 'X-Jarvis': '1', 'Accept-Language': i18n.language, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: 'include', timeoutMs })
  const job = async (p: Promise<{ job: Job }>) => (await p).job
  return {
    progress: () => call('/api/setup/progress'),
    saveProgress: (p) => call('/api/setup/progress', 'POST', p),
    connection: () => call('/api/setup/connection', 'GET', undefined, 15000),
    checkRemote: () => call('/api/setup/check-remote', 'POST', {}, 15000),
    healthy: async () => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 2_500)
        const r = await fetch(`${homeUrl}/api/state`, { signal: ctrl.signal })
        clearTimeout(t)
        return r.ok
      } catch {
        return false
      }
    },
    state: () => call('/api/state'),
    setup: async (code, password) => void (await call('/api/auth/setup', 'POST', { code, password })),
    login: async (password) => void (await call('/api/auth/login', 'POST', { password })),
    changePassword: async (oldPassword, newPassword) => void (await call('/api/auth/password', 'POST', { old: oldPassword, new: newPassword })),
    logout: async () => void (await call('/api/auth/logout', 'POST')),
    setupInfo: () => call('/api/setup/info'),
    settings: () => call('/api/settings'),
    preview: (changes, initial) => call('/api/settings/preview', 'POST', { changes, initial }),
    apply: (changes, initial) => job(call('/api/apply', 'POST', { changes, initial })),
    job: (id, since = 0) => call(`/api/jobs/${encodeURIComponent(id)}?since=${since}`),
    status: () => call('/api/status', 'GET', undefined, 30_000),
    logs: (service, tail = 300) => call(`/api/logs/${encodeURIComponent(service)}?tail=${tail}`, 'GET', undefined, 25_000),
    wa: () => call('/api/wa'),
    relink: (confirm, phone) => job(call('/api/wa/relink', 'POST', { confirm, phone })),
    testOpenAi: (key, baseUrl) => call('/api/test/openai', 'POST', { key, baseUrl }, 20_000),
    openRouterStart: (redirect) => call('/api/openrouter/start', 'POST', { redirect }),
    openRouterFinish: (state, code) => call('/api/openrouter/finish', 'POST', { state, code }, 20_000),
    backups: async () => (await call<{ backups: Backup[] }>('/api/backups')).backups,
    restore: (name) => job(call(`/api/backups/${encodeURIComponent(name)}/restore`, 'POST')),
    restart: (service) => job(call('/api/maintenance/restart', 'POST', { service })),
    rebuild: () => job(call('/api/maintenance/rebuild', 'POST')),
    estimate: () => job(call('/api/maintenance/estimate', 'POST')),
    pairing: () => call('/api/pairing', 'POST'),
    ownerPassword: async (adminPassword, newPassword) => void (await call('/api/owner-password', 'POST', { password: adminPassword, newPassword })),
  }
}
