// Sign in with OpenRouter (OAuth with PKCE) instead of copying an API key. OpenRouter sends the browser back with a
// one-time code; this server swaps it for a key. Neither the code verifier nor the key reach the browser: the wizard
// applies the placeholder OPENROUTER_PENDING, which the server replaces with the key it holds.
import { createHash, randomBytes } from 'node:crypto'
import { ApplyError } from './apply.js'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const AUTH_URL = 'https://openrouter.ai/auth'
const EXCHANGE_URL = `${OPENROUTER_BASE_URL}/auth/keys`
/** OpenRouter's codes expire after 10 minutes; a pending sign-in is useless after that */
const TTL_MS = 10 * 60_000
const MAX_PENDING = 20

/** Settings that go with an OpenRouter key: models in OpenRouter's naming, embeddings on the device (OpenRouter has
 * no transcription; the embedder talks to OpenAI directly). */
export const OPENROUTER_SETTINGS: Record<string, string> = {
  OPENAI_BASE_URL: OPENROUTER_BASE_URL,
  APP_MODEL: 'openai/gpt-4.1-mini',
  ORGANIZER_MODEL: 'openai/gpt-4.1-mini',
  IMAGE_MODEL: 'openai/gpt-4.1-mini',
  EMBED_PROVIDER: 'local',
  TRANSCRIBE_PROVIDER: 'off',
}

/** Stands for the key from the last OpenRouter sign-in in the wizard's changes */
export const OPENROUTER_PENDING = '@openrouter'

export class OpenRouterLogin {
  private pending = new Map<string, { verifier: string; at: number }>()
  /** key from the last finished sign-in, until it is applied */
  private key: string | null = null

  constructor(private exchange: (body: object) => Promise<Response> = (body) =>
    fetch(EXCHANGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })) {}

  /** Address of OpenRouter's sign-in page. Without callbackUrl OpenRouter shows the code to copy instead. */
  start(callbackUrl?: string) {
    const now = Date.now()
    for (const [state, p] of this.pending) if (now - p.at > TTL_MS) this.pending.delete(state)
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!)
    const state = randomBytes(16).toString('hex')
    const verifier = randomBytes(32).toString('base64url')
    this.pending.set(state, { verifier, at: now })
    const u = new URL(AUTH_URL)
    if (callbackUrl) u.searchParams.set('callback_url', callbackUrl)
    u.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    u.searchParams.set('code_challenge_method', 'S256')
    u.searchParams.set('key_label', 'Jarvis')
    u.searchParams.set('state', state)
    return { url: u.toString(), state }
  }

  /** Swaps the code from OpenRouter for an API key and keeps it for resolve. Each sign-in can be finished once. */
  async finish(state: string, code: string): Promise<void> {
    this.key = await this.swap(state, code)
  }

  /** For tests and development without a network */
  hold(key: string) {
    this.key = key
  }

  /** Replaces the placeholder with the held key. consume: forget the key afterwards (once it is applied). */
  resolve(changes: Record<string, string | null>, consume = false): Record<string, string | null> {
    if (changes.OPENAI_API_KEY !== OPENROUTER_PENDING) return changes
    if (!this.key) throw new ApplyError('Die Anmeldung bei OpenRouter ist nicht mehr gültig (Neustart?). Bitte noch einmal verbinden.')
    const resolved = { ...changes, OPENAI_API_KEY: this.key }
    if (consume) this.key = null
    return resolved
  }

  private async swap(state: string, code: string): Promise<string> {
    const p = this.pending.get(state)
    this.pending.delete(state)
    if (!p || Date.now() - p.at > TTL_MS) throw new ApplyError('Die Anmeldung bei OpenRouter ist abgelaufen. Bitte noch einmal verbinden.')
    if (!/^[A-Za-z0-9._~-]{1,500}$/.test(code)) throw new ApplyError('Der Code von OpenRouter ist ungültig.')
    let r: Response
    try {
      r = await this.exchange({ code, code_verifier: p.verifier, code_challenge_method: 'S256' })
    } catch (e) {
      throw new ApplyError(`Keine Verbindung zu OpenRouter: ${(e as Error).message}`)
    }
    if (!r.ok) throw new ApplyError(r.status === 403 ? 'OpenRouter hat die Anmeldung abgelehnt. Bitte noch einmal verbinden.' : `Antwort ${r.status} von OpenRouter.`)
    const key = ((await r.json().catch(() => null)) as { key?: unknown } | null)?.key
    if (typeof key !== 'string' || !/^sk-[A-Za-z0-9_-]{20,300}$/.test(key)) throw new ApplyError('OpenRouter hat keinen gültigen Schlüssel geliefert.')
    return key
  }
}
