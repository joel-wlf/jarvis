// Request and response types of the app API (/api/v1) served by mcp-server, and of the pairing flow.
// Auth: every request except pair/login/info carries "Authorization: Bearer <deviceToken or OAuth access token>".
import type { Card, CardAction, CardGroup, Stat, Suggestion, Urgency } from './cards.js'

export const API_VERSION = 1
export const API_PREFIX = '/api/v1'

/** Error body for every non-2xx response. `code` is stable and meant for the app to branch on. */
export interface ApiError {
  error: {
    code: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'rate_limited' | 'unavailable' | 'internal'
    message: string
    /** field -> message, for form errors */
    fields?: Record<string, string>
  }
}

// --- server info and auth --------------------------------------------------------------------

/** GET /api/v1/info (no auth). The app calls this first after the user enters a URL. */
export interface ServerInfo {
  name: 'jarvis'
  assistantName?: string
  setupComplete?: boolean
  apiVersion: number
  version: string
  ownerName?: string
  /** whether an owner password exists; a server address QR always requires password login */
  passwordLogin: boolean
  /** OAuth authorization server metadata URL, for MCP clients */
  oauthMetadata: string
}

/** Legacy pairing payload. New connection QRs contain only a plain server URL and always require a password. */
export interface PairingPayload {
  v: 1
  /** public URL of the API (Cloudflare tunnel), e.g. https://jarvis.example.com */
  url: string
  /** optional home network URL of the admin interface, e.g. http://192.168.1.20:8080 */
  homeUrl?: string
  code: string
}

/** POST /api/v1/pair */
export interface PairRequest { code: string; deviceName: string; platform: 'ios' | 'android' | 'web' }
/** POST /api/v1/login */
export interface LoginRequest { password: string; deviceName: string; platform: 'ios' | 'android' | 'web' }
export interface AuthResponse { token: string; deviceId: string; ownerName?: string }

/** GET /api/v1/devices */
export interface Device {
  id: string
  name: string
  platform: 'ios' | 'android' | 'web' | 'mcp'
  kind: 'device' | 'oauth'
  createdAt: string
  lastSeenAt?: string
  current?: boolean
}
export interface DevicesResponse { devices: Device[] }
// DELETE /api/v1/devices/:id -> 204

// --- home ------------------------------------------------------------------------------------

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'notify' | 'happy' | 'sleep' | 'error'

/** GET /api/v1/home */
export interface HomeResponse {
  now: string
  ownerName?: string
  jarvis: { state: JarvisState; say: string }
  stats: Stat[]
  modules: {
    messages: { days: string[]; incoming: number[]; handled: number[]; deltaPct?: number }
    week: { days: string[]; counts: number[]; todayIndex: number; total: number }
    system: { servicesOk: number; servicesTotal: number; lastSource?: string; lastAt?: string }
  }
  counts: Record<CardGroup | 'all', number>
}

// --- cards -----------------------------------------------------------------------------------

/** GET /api/v1/cards?group=reply */
export interface CardsResponse { cards: Card[] }

/** POST /api/v1/cards/:key/act */
export interface ActRequest { action: CardAction }
export interface ActResponse { ok: true; message: string; removed: boolean }

/**
 * PUT /api/v1/cards/:key/priority. The owner's importance for a card: 3 important (always reported by the watch service),
 * 2 normal, 1 later (never reported actively), null = back to Jarvis' guess. The card list then returns it as `urgency`.
 */
export interface PriorityRequest { priority: Urgency | null }
export interface PriorityResponse { ok: true; priority: Urgency | null }

/** POST /api/v1/cards/:key/suggest -> fresh reply suggestions (OpenAI, cached per card) */
export interface SuggestResponse { suggestions: Suggestion[]; cached: boolean }

// --- people ----------------------------------------------------------------------------------

export type Relationship = 'family' | 'partner' | 'close_friend' | 'friend' | 'acquaintance' | 'colleague' | 'club' | 'service' | 'other'

export interface PersonSummary {
  jid: string
  name: string
  initials: string
  relationship?: Relationship
  closeness?: number
  lastContactAt?: string
  openCards: number
}
/** GET /api/v1/people?q= */
export interface PeopleResponse { people: PersonSummary[] }

/** GET /api/v1/people/:jid */
export interface PersonDetail extends PersonSummary {
  realName?: string
  aliases: string[]
  formality?: 'du' | 'sie' | 'mixed'
  tone?: string
  note?: string
  locked: boolean
  source: 'auto' | 'user'
  stats: Stat[]
  memories: Memory[]
  recent: { at: string; fromMe: boolean; text: string }[]
}
/** PATCH /api/v1/people/:jid */
export type PersonPatch = Partial<Pick<PersonDetail, 'realName' | 'aliases' | 'relationship' | 'closeness' | 'formality' | 'tone' | 'note' | 'locked'>>

// --- memory ----------------------------------------------------------------------------------

export type MemoryScope = 'global' | 'chat' | 'topic' | 'thread' | 'contact'
export interface Memory {
  id: number
  content: string
  scope: MemoryScope
  chatJid?: string
  contactJid?: string
  topicId?: number
  pinned: boolean
  active: boolean
  createdAt: string
  updatedAt: string
  /** display label of the scope target ("Mama", "Projekt Nordlicht") */
  scopeLabel?: string
}
/** GET /api/v1/memories?q=&scope= */
export interface MemoriesResponse { memories: Memory[] }
/** POST /api/v1/memories */
export type MemoryCreate = Pick<Memory, 'content' | 'scope'> & Partial<Pick<Memory, 'chatJid' | 'contactJid' | 'topicId' | 'pinned'>>
/** PATCH /api/v1/memories/:id */
export type MemoryPatch = Partial<Pick<Memory, 'content' | 'pinned' | 'active' | 'scope' | 'chatJid' | 'contactJid' | 'topicId'>>
// DELETE /api/v1/memories/:id -> 204

// --- ask jarvis ------------------------------------------------------------------------------

/** POST /api/v1/ask, answered as Server-Sent Events */
export interface AskRequest { question: string; conversationId?: string }
export type AskEvent =
  | { type: 'state'; state: JarvisState }
  | { type: 'delta'; text: string }
  | { type: 'source'; label: string; chatJid?: string; at?: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string }

// --- live events -----------------------------------------------------------------------------

/** GET /api/v1/events (SSE) */
export type LiveEvent =
  | { type: 'message'; source: string; at: string; todayCount: number }
  | { type: 'cards'; counts: HomeResponse['counts'] }
  | { type: 'health'; ok: boolean; whatsapp: string }
