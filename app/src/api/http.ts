// Shared fetch helpers: JSON requests with timeouts, typed errors, and an SSE reader.
import { fetch as streamingFetch } from 'expo/fetch'
import type { ApiError } from '@jarvis/contract'

export type ErrorCode = ApiError['error']['code'] | 'network' | 'timeout'

export class JarvisError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 0,
    public fields?: Record<string, string>,
  ) {
    super(message)
  }
}

const STATUS_CODE: Record<number, ErrorCode> = { 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 400: 'invalid', 422: 'invalid', 429: 'rate_limited', 503: 'unavailable' }

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
  credentials?: RequestCredentials
  signal?: AbortSignal
}

export { normalizeUrl } from './server-url'

export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000)
  opts.signal?.addEventListener('abort', () => ctrl.abort())
  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: opts.credentials,
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if (ctrl.signal.aborted) throw new JarvisError('timeout', 'timeout')
    throw new JarvisError('network', (e as Error).message || 'network')
  }
  clearTimeout(timer)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  if (!res.ok) {
    // App API: { error: { code, message, fields } }. Admin API: { error: "message" }.
    const err = (json as { error?: unknown } | undefined)?.error
    if (err && typeof err === 'object') {
      const e = err as ApiError['error']
      throw new JarvisError(e.code, e.message, res.status, e.fields)
    }
    throw new JarvisError(STATUS_CODE[res.status] ?? 'internal', typeof err === 'string' ? err : `HTTP ${res.status}`, res.status)
  }
  return json as T
}

/**
 * Reads a Server-Sent Events response and calls onEvent with each parsed JSON `data:` payload.
 * Uses expo/fetch because React Native's built-in fetch cannot stream response bodies.
 */
export async function readSse<E>(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }, onEvent: (e: E) => void): Promise<void> {
  const res = await streamingFetch(url, {
    method: init.method ?? 'GET',
    headers: { Accept: 'text/event-stream', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  })
  if (!res.ok || !res.body) throw new JarvisError(STATUS_CODE[res.status] ?? 'internal', `HTTP ${res.status}`, res.status)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data) continue
      try {
        onEvent(JSON.parse(data) as E)
      } catch {
        // ignore malformed events
      }
    }
  }
}
