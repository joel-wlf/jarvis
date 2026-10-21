// AI providers the setup offers. Every Jarvis service talks to an OpenAI-compatible API, so a provider is
// a base URL plus model suggestions. Model ids are suggestions only; the user can type any id.

export type ProviderId = 'openai' | 'openrouter' | 'anthropic' | 'ollama' | 'custom' | 'none'

/** The three jobs that use a language model, mapped to their setting keys. */
export const MODEL_ROLES = [
  { key: 'APP_MODEL', i18n: 'app' },
  { key: 'ORGANIZER_MODEL', i18n: 'organizer' },
  { key: 'IMAGE_MODEL', i18n: 'images' },
] as const
export type ModelKey = (typeof MODEL_ROLES)[number]['key']

export interface Provider {
  id: ProviderId
  baseUrl: string
  /** whether an API key is needed */
  key: boolean
  /** whether the provider offers speech-to-text and embeddings; if not, Jarvis uses its local services */
  audioAndEmbeddings: boolean
  /** where to get a key, shown as a hint */
  keyUrl?: string
  models: Record<ModelKey, string[]>
}

const same = (ids: string[]): Record<ModelKey, string[]> => ({ APP_MODEL: ids, ORGANIZER_MODEL: ids, IMAGE_MODEL: ids })

export const PROVIDERS: Provider[] = [
  {
    id: 'openai', baseUrl: 'https://api.openai.com/v1', key: true, audioAndEmbeddings: true, keyUrl: 'platform.openai.com/api-keys',
    models: { APP_MODEL: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'], ORGANIZER_MODEL: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1'], IMAGE_MODEL: ['gpt-4.1-mini', 'gpt-4o-mini'] },
  },
  {
    id: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', key: true, audioAndEmbeddings: false, keyUrl: 'console.anthropic.com',
    models: { APP_MODEL: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'], ORGANIZER_MODEL: ['claude-haiku-5-5', 'claude-sonnet-5-5'], IMAGE_MODEL: ['claude-haiku-5-5', 'claude-sonnet-5-5'] },
  },
  {
    id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', key: true, audioAndEmbeddings: false, keyUrl: 'openrouter.ai/keys',
    models: same(['openai/gpt-4.1-mini', 'google/gemini-2.5-flash', 'mistralai/mistral-small']),
  },
  {
    id: 'ollama', baseUrl: 'http://192.168.1.20:11434/v1', key: false, audioAndEmbeddings: false,
    models: { APP_MODEL: ['qwen2.5:7b', 'llama3.1:8b', 'gemma3:4b'], ORGANIZER_MODEL: ['qwen2.5:7b', 'llama3.1:8b'], IMAGE_MODEL: ['gemma3:4b', 'llava:7b'] },
  },
  { id: 'custom', baseUrl: '', key: true, audioAndEmbeddings: false, models: same([]) },
  { id: 'none', baseUrl: '', key: false, audioAndEmbeddings: false, models: same([]) },
]

export const providerById = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!

/** Guess the provider from stored settings, so re-running the setup keeps the current choice. */
export function detectProvider(baseUrl: string | undefined, hasKey: boolean): ProviderId {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const hit = PROVIDERS.find((p) => p.baseUrl && url === p.baseUrl)
  if (hit) return hit.id === 'openai' && !hasKey ? 'none' : hit.id
  return /:11434/.test(url) ? 'ollama' : 'custom'
}

/** Settings a provider choice implies besides the base URL and models. */
export function providerChanges(p: Provider): Record<string, string> {
  if (p.id === 'none') return { TRANSCRIBE_PROVIDER: 'local', EMBED_PROVIDER: 'local', ORGANIZER_ENABLED: 'false', IMAGE_DESCRIBE: 'false' }
  const local = p.audioAndEmbeddings ? '' : 'local'
  return { OPENAI_BASE_URL: p.baseUrl, TRANSCRIBE_PROVIDER: local, EMBED_PROVIDER: local }
}

// --- cost preview -----------------------------------------------------------------------------
// Rough list prices in USD per 1M tokens (input, output). Guide values only: providers change prices,
// and the real bill depends on how many messages arrive. Unknown models show no estimate.
const PRICES: Record<string, [number, number]> = {
  'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6],
  'claude-haiku-5-5': [1, 5], 'claude-sonnet-5-5': [3, 15], 'claude-opus-5-5': [5, 25],
  'openai/gpt-4.1-mini': [0.4, 1.6], 'google/gemini-2.5-flash': [0.3, 2.5], 'mistralai/mistral-small': [0.1, 0.3],
}

/** Assumed monthly volume per job at about 300 incoming messages a day, in millions of tokens (input, output). */
const VOLUME: Record<ModelKey, [number, number]> = {
  APP_MODEL: [1.5, 0.2], // replies, suggestions, Ask Jarvis
  ORGANIZER_MODEL: [6, 0.6], // sorting every message into threads, topics and cards
  IMAGE_MODEL: [1, 0.1], // describing shared photos
}

/** Estimated USD per month for one job, 0 for local models, null when the price is unknown. */
export function monthlyCost(provider: ProviderId, key: ModelKey, model: string): number | null {
  if (provider === 'ollama' || provider === 'none') return 0
  const p = PRICES[model]
  if (!p) return null
  const [i, o] = VOLUME[key]
  return i * p[0] + o * p[1]
}

export const formatUsd = (n: number, locale: string) =>
  n === 0 ? '0 $' : `${n < 1 ? '< 1' : n.toLocaleString(locale, { maximumFractionDigits: 0 })} $`
