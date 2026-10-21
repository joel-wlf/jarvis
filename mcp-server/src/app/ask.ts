// "Ask Jarvis": OpenAI answers with access to the existing read-only MCP tools, streamed as Server-Sent Events.
// The tools run in-process through an in-memory MCP client, so the app uses exactly the queries Claude uses.
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { AskEvent } from '@jarvis/contract'
import { buildServer } from '../tools.js'
import { chatStream, type ChatMessage } from './openai.js'
import { ApiFail, lang, str } from './http.js'

/** Read-only tools the model may call. Anything that writes or sends stays with Claude and the card actions. */
const READ_TOOLS = new Set([
  'search_messages', 'semantic_search', 'list_topics', 'get_topic', 'list_threads', 'get_thread', 'get_recent_messages', 'get_conversation_context',
  'list_chats', 'find_contact', 'get_person', 'list_people', 'recall', 'get_dashboard', 'get_open_polls', 'get_poll_results', 'find_scheduling_mentions',
  'list_suggested_actions', 'list_reminders', 'get_writing_style', 'get_chat_stats', 'read_me',
])
const MAX_ROUNDS = 6
const MAX_TOOL_CHARS = 12_000

interface Conversation { messages: ChatMessage[]; at: number }
const conversations = new Map<string, Conversation>()
setInterval(() => {
  const now = Date.now()
  for (const [id, c] of conversations) if (now - c.at > 3600_000) conversations.delete(id)
}, 60_000).unref()

function sourceLabel(name: string, args: Record<string, unknown>): string {
  const what = [args.query, args.chat, args.contact, args.sender, args.id].find((x) => typeof x === 'string' || typeof x === 'number')
  return what !== undefined ? `${name}: ${String(what).slice(0, 60)}` : name
}

export async function ask(req: Request, res: Response) {
  const question = str(req.body?.question, 'question', { max: 2000 })
  const convId = typeof req.body?.conversationId === 'string' && conversations.has(req.body.conversationId) ? req.body.conversationId : randomUUID()
  const l = lang(req)

  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const send = (e: AskEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`)
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  const server = await buildServer()
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'jarvis-app-ask', version: '1.0.0' })
  try {
    await server.connect(serverT)
    await client.connect(clientT)
    send({ type: 'state', state: 'thinking' })
    const tools = (await client.listTools()).tools
      .filter((t) => READ_TOOLS.has(t.name))
      .map((t) => ({ type: 'function', function: { name: t.name, description: (t.description ?? '').slice(0, 1000), parameters: t.inputSchema } }))

    const conv = conversations.get(convId) ?? { messages: [], at: Date.now() }
    const system: ChatMessage = {
      role: 'system',
      content:
        `${client.getInstructions() ?? ''}\n\nDu antwortest in der Jarvis-App, nicht in Claude. Du kannst nur lesen: nichts senden, merken oder ändern. ` +
        `Antworte kurz in ${l === 'de' ? 'Deutsch' : 'English'}, ohne Tabellen, mit Quelle (Chat, Datum).`,
    }
    conv.messages.push({ role: 'user', content: question })
    const messages: ChatMessage[] = [system, ...conv.messages]
    let speaking = false
    let answer = ''
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const out = await chatStream(messages, round < MAX_ROUNDS - 1 ? tools : [], (text) => {
        if (!speaking) ((speaking = true), send({ type: 'state', state: 'speaking' }))
        send({ type: 'delta', text })
      }, abort.signal)
      answer += out.content
      if (!out.toolCalls.length) break
      messages.push({ role: 'assistant', content: out.content || null, tool_calls: out.toolCalls })
      for (const tc of out.toolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          /* model sent broken JSON; the tool reports the missing fields */
        }
        let result: string
        if (!READ_TOOLS.has(tc.function.name)) result = 'Tool not available in the app.'
        else {
          send({ type: 'source', label: sourceLabel(tc.function.name, args) })
          const r = await client.callTool({ name: tc.function.name, arguments: args }).catch((e) => ({ content: [{ type: 'text', text: `Error: ${(e as Error).message}` }] }))
          result = ((r.content ?? []) as { type: string; text?: string }[]).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n').slice(0, MAX_TOOL_CHARS)
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }
    conv.messages.push({ role: 'assistant', content: answer })
    conv.messages = conv.messages.slice(-20)
    conv.at = Date.now()
    conversations.set(convId, conv)
    if (conversations.size > 50) conversations.delete(conversations.keys().next().value!)
    send({ type: 'state', state: 'idle' })
    send({ type: 'done', conversationId: convId })
  } catch (e) {
    if (!abort.signal.aborted) {
      if (!(e instanceof ApiFail)) console.error(e)
      send({ type: 'state', state: 'error' })
      send({ type: 'error', message: e instanceof ApiFail ? e.message : 'Internal error' })
    }
  } finally {
    res.end()
    client.close().catch(() => {})
    server.close().catch(() => {})
  }
}
