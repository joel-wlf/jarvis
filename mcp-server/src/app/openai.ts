// Minimal OpenAI chat completions client (fetch, no SDK), shared by suggest and ask.
import { fail } from './http.js'

export const AI_MODEL = process.env.APP_MODEL || 'gpt-4.1-mini'
const base = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export function aiAvailable() {
  return !!process.env.OPENAI_API_KEY
}

async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
  if (!aiAvailable()) throw fail('unavailable', 'No OpenAI API key configured (OPENAI_API_KEY)')
  const res = await fetch(`${base()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`)
    throw fail('unavailable', `AI provider error (HTTP ${res.status})`)
  }
  return res
}

/** One JSON object answer (response_format json_object). */
export async function chatJson<T>(messages: ChatMessage[], opts: { maxTokens?: number } = {}): Promise<T> {
  const res = await post({ model: AI_MODEL, messages, response_format: { type: 'json_object' }, max_tokens: opts.maxTokens ?? 600, temperature: 0.7 })
  const j = (await res.json()) as { choices: { message: { content: string } }[] }
  try {
    return JSON.parse(j.choices[0].message.content) as T
  } catch {
    throw fail('unavailable', 'AI provider returned invalid JSON')
  }
}

/**
 * Streaming completion with tools. Calls onDelta for text as it arrives and returns the assistant message
 * (text and/or tool calls) once the stream ends.
 */
export async function chatStream(
  messages: ChatMessage[],
  tools: unknown[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const res = await post({ model: AI_MODEL, messages, tools: tools.length ? tools : undefined, stream: true, temperature: 0.3 }, signal)
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let content = ''
  const calls: ToolCall[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let chunk: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }
      const d = chunk.choices?.[0]?.delta
      if (!d) continue
      if (d.content) {
        content += d.content
        onDelta(d.content)
      }
      for (const tc of d.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
        if (tc.id) c.id = tc.id
        if (tc.function?.name) c.function.name += tc.function.name
        if (tc.function?.arguments) c.function.arguments += tc.function.arguments
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean) }
}
