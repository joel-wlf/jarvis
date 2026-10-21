// Typed client for the Jarvis app API (/api/v1), built on @jarvis/contract.
import {
  API_PREFIX,
  type ActResponse,
  type AskEvent,
  type CardContextResponse,
  type PreferencesResponse,
  type ResyncResponse,
  type RuleRequest,
  type StatusResponse,
  type AskRequest,
  type AuthResponse,
  type CardAction,
  type CardGroup,
  type CardsResponse,
  type DevicesResponse,
  type HomeResponse,
  type LiveEvent,
  type LoginRequest,
  type MemoriesResponse,
  type Memory,
  type MemoryCreate,
  type MemoryPatch,
  type MemoryScope,
  type PairRequest,
  type PeopleResponse,
  type PersonDetail,
  type PersonPatch,
  type PriorityResponse,
  type ServerInfo,
  type SuggestResponse,
  type Urgency,
} from '@jarvis/contract'
import { Platform } from 'react-native'
import i18n from '@/i18n'
import { readSse, requestJson } from './http'

/** Everything the screens need from the server. Implemented by the HTTP client and by the mock. */
export interface JarvisApi {
  home(): Promise<HomeResponse>
  cards(group?: CardGroup): Promise<CardsResponse>
  act(key: string, action: CardAction): Promise<ActResponse>
  /** Importance of a card; null hands the decision back to Jarvis. The server stores it and the watch service follows it. */
  setPriority(key: string, priority: Urgency | null): Promise<PriorityResponse>
  suggest(key: string): Promise<SuggestResponse>
  /** The chat and messages a card comes from. */
  context(key: string): Promise<CardContextResponse>
  /** A playable source for a voice message (web: a blob URL; native: a URL with headers). */
  media(chatJid: string, messageId: string): Promise<{ uri: string; headers?: Record<string, string> }>
  preferences(): Promise<PreferencesResponse>
  setRule(rule: RuleRequest): Promise<PreferencesResponse>
  removeRule(key: string): Promise<PreferencesResponse>
  setLearning(enabled: boolean): Promise<PreferencesResponse>
  forgetLearned(): Promise<PreferencesResponse>
  /** Import and background processing, shown after setup. */
  status(): Promise<StatusResponse>
  /** Ask WhatsApp for the address book names again. */
  resyncContacts(): Promise<ResyncResponse>
  people(q?: string): Promise<PeopleResponse>
  person(jid: string): Promise<PersonDetail>
  patchPerson(jid: string, patch: PersonPatch): Promise<PersonDetail>
  memories(q?: string, scope?: MemoryScope): Promise<MemoriesResponse>
  createMemory(m: MemoryCreate): Promise<Memory>
  patchMemory(id: number, patch: MemoryPatch): Promise<Memory>
  deleteMemory(id: number): Promise<void>
  devices(): Promise<DevicesResponse>
  revokeDevice(id: string): Promise<void>
  /** Streams the answer; resolves when the stream ends. */
  ask(req: AskRequest, onEvent: (e: AskEvent) => void, signal?: AbortSignal): Promise<void>
  /** Subscribes to live events; returns an unsubscribe function. */
  live(onEvent: (e: LiveEvent) => void): () => void
}

const qs = (params: Record<string, string | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v)
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}` : ''
}

// --- unauthenticated calls used by the connect screen ---------------------------------------

export const fetchInfo = (baseUrl: string) => requestJson<ServerInfo>(`${baseUrl}${API_PREFIX}/info`, { timeoutMs: 8_000 })
export const pair = (baseUrl: string, req: PairRequest) => requestJson<AuthResponse>(`${baseUrl}${API_PREFIX}/pair`, { method: 'POST', body: req })
export const login = (baseUrl: string, req: LoginRequest) => requestJson<AuthResponse>(`${baseUrl}${API_PREFIX}/login`, { method: 'POST', body: req })

export function createHttpApi(baseUrl: string, token: string, onUnauthorized?: () => void): JarvisApi {
  const root = `${baseUrl}${API_PREFIX}`
  const auth = { Authorization: `Bearer ${token}` }
  // The server words cards and messages in the app's language
  const call = async <T>(path: string, opts: Parameters<typeof requestJson>[1] = {}) => {
    try {
      return await requestJson<T>(`${root}${path}`, { ...opts, headers: { ...auth, 'Accept-Language': i18n.language, ...opts.headers } })
    } catch (e) {
      if ((e as { code?: string }).code === 'unauthorized') onUnauthorized?.()
      throw e
    }
  }
  return {
    home: () => call('/home'),
    cards: (group) => call(`/cards${qs({ group })}`),
    act: (key, action) => call(`/cards/${encodeURIComponent(key)}/act`, { method: 'POST', body: { action } }),
    setPriority: (key, priority) => call(`/cards/${encodeURIComponent(key)}/priority`, { method: 'PUT', body: { priority } }),
    suggest: (key) => call(`/cards/${encodeURIComponent(key)}/suggest`, { method: 'POST', timeoutMs: 30_000 }),
    context: (key) => call(`/cards/${encodeURIComponent(key)}/context`),
    media: async (chatJid, messageId) => {
      const url = `${root}/media/${encodeURIComponent(chatJid)}/${encodeURIComponent(messageId)}`
      if (Platform.OS !== 'web') return { uri: url, headers: auth }
      // The browser's audio element cannot send the token: load the file first and play it from memory
      const res = await fetch(url, { headers: auth })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      return { uri: URL.createObjectURL(await res.blob()) }
    },
    preferences: () => call('/preferences'),
    setRule: (rule) => call('/preferences/rules', { method: 'PUT', body: rule }),
    removeRule: (key) => call(`/preferences/rules/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    setLearning: (enabled) => call('/preferences/learning', { method: 'PUT', body: { enabled } }),
    forgetLearned: () => call('/preferences/forget', { method: 'POST' }),
    status: () => call('/status'),
    resyncContacts: () => call('/contacts/resync', { method: 'POST', timeoutMs: 90_000 }),
    people: (q) => call(`/people${qs({ q })}`),
    person: (jid) => call(`/people/${encodeURIComponent(jid)}`),
    patchPerson: (jid, patch) => call(`/people/${encodeURIComponent(jid)}`, { method: 'PATCH', body: patch }),
    memories: (q, scope) => call(`/memories${qs({ q, scope })}`),
    createMemory: (m) => call('/memories', { method: 'POST', body: m }),
    patchMemory: (id, patch) => call(`/memories/${id}`, { method: 'PATCH', body: patch }),
    deleteMemory: (id) => call(`/memories/${id}`, { method: 'DELETE' }),
    devices: () => call('/devices'),
    revokeDevice: (id) => call(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    ask: (req, onEvent, signal) => readSse<AskEvent>(`${root}/ask`, { method: 'POST', headers: auth, body: req, signal }, onEvent),
    live: (onEvent) => {
      const ctrl = new AbortController()
      let retry = 2_000
      const loop = async () => {
        while (!ctrl.signal.aborted) {
          try {
            await readSse<LiveEvent>(`${root}/events`, { headers: auth, signal: ctrl.signal }, (e) => {
              retry = 2_000
              onEvent(e)
            })
          } catch {
            // reconnect below
          }
          if (ctrl.signal.aborted) return
          await new Promise((r) => setTimeout(r, retry))
          retry = Math.min(retry * 2, 60_000)
        }
      }
      void loop()
      return () => ctrl.abort()
    },
  }
}
