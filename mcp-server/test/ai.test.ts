import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import { auth, json, setOnline, start, testDb, type Running } from './helpers.js'
import { createDevice } from '../src/app/store.js'

// Fake OpenAI: JSON answers for suggest, a tool call followed by streamed text for ask
let pg: PGlite
let s: Running
let ai: http.Server
let token: string
const calls: any[] = []

function sse(res: http.ServerResponse, chunks: unknown[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.end('data: [DONE]\n\n')
}

before(async () => {
  ai = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const b = JSON.parse(body)
      calls.push(b)
      if (b.response_format) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return void res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ suggestions: [{ label: 'Zusagen', text: 'bin dabei 👍' }, { label: 'Absagen', text: 'schaff ich leider nicht' }] }) } }] }))
      }
      const hadTool = b.messages.some((m: any) => m.role === 'tool')
      if (!hadTool)
        return sse(res, [
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_reminders', arguments: '{"al' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'l":false}' } }] } }] },
        ])
      sse(res, [{ choices: [{ delta: { content: 'Du musst ' } }] }, { choices: [{ delta: { content: 'das Paket abholen.' } }] }])
    })
  })
  await new Promise<void>((r) => ai.listen(0, '127.0.0.1', r))
  process.env.OPENAI_API_KEY = 'sk-test'
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(ai.address() as AddressInfo).port}/v1`
  pg = await testDb()
  s = await start()
  token = (await createDevice('Test', 'web')).token
  await setOnline(pg)
  const ANNA = 'anna@s.whatsapp.net'
  await pg.query(`INSERT INTO contacts (jid, name) VALUES ($1, 'Anna')`, [ANNA])
  await pg.query(`INSERT INTO chats (jid, name, is_group) VALUES ($1, 'Anna', false)`, [ANNA])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ('m1', $1, $1, false, now() - interval '3 hours', 'text', 'Kommst du heute?')`, [ANNA])
  await pg.query(`INSERT INTO reminders (text, due_at) VALUES ('Paket abholen', now() + interval '1 hour')`)
})
after(async () => {
  delete process.env.OPENAI_API_KEY
  await s.close()
  await pg.close()
  ai.closeAllConnections()
  await new Promise((r) => ai.close(r))
})

test('suggest: replies in the owner style, cached until the chat changes', async () => {
  const cards = (await (await fetch(`${s.url}/api/v1/cards?group=reply`, { headers: auth(token) })).json()).cards
  const key = encodeURIComponent(cards[0].key)
  const first = await (await fetch(`${s.url}/api/v1/cards/${key}/suggest`, json({}, auth(token)))).json()
  assert.equal(first.cached, false)
  assert.deepEqual(first.suggestions[0], { id: 'reply-0', label: 'Zusagen', action: { kind: 'send', text: 'bin dabei 👍' }, primary: true })
  assert.match(calls.at(-1).messages[1].content, /Kommst du heute\?/)
  const second = await (await fetch(`${s.url}/api/v1/cards/${key}/suggest`, json({}, auth(token)))).json()
  assert.equal(second.cached, true)
  const n = calls.length
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ('m2', 'anna@s.whatsapp.net', 'anna@s.whatsapp.net', false, now() - interval '2 hours 30 minutes', 'text', 'Oder morgen?')`)
  const cards2 = (await (await fetch(`${s.url}/api/v1/cards?group=reply`, { headers: auth(token) })).json()).cards
  const third = await (await fetch(`${s.url}/api/v1/cards/${encodeURIComponent(cards2[0].key)}/suggest`, json({}, auth(token)))).json()
  assert.equal(third.cached, false)
  assert.equal(calls.length, n + 1)
})

test('ask: streams state, source, deltas and done over SSE, using read-only tools', async () => {
  const res = await fetch(`${s.url}/api/v1/ask`, json({ question: 'Was steht heute an?' }, auth(token)))
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type')!, /text\/event-stream/)
  const events = (await res.text()).split('\n\n').filter((x) => x.startsWith('data: ')).map((x) => JSON.parse(x.slice(6)))
  assert.deepEqual(events[0], { type: 'state', state: 'thinking' })
  assert.deepEqual(events.find((e) => e.type === 'source'), { type: 'source', label: 'list_reminders' })
  assert.equal(events.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'Du musst das Paket abholen.')
  const done = events.at(-1)
  assert.equal(done.type, 'done')
  // the tool result reached the model, and only read tools were offered
  const last = calls.at(-1)
  assert.match(last.messages.find((m: any) => m.role === 'tool').content, /Paket abholen/)
  const offered = calls.at(-2).tools.map((t: any) => t.function.name)
  assert.ok(offered.includes('search_messages'))
  assert.ok(!offered.includes('send_message') && !offered.includes('remember'))
  // follow-up keeps the conversation
  const res2 = await fetch(`${s.url}/api/v1/ask`, json({ question: 'Und morgen?', conversationId: done.conversationId }, auth(token)))
  const ev2 = (await res2.text()).split('\n\n').filter((x) => x.startsWith('data: ')).map((x) => JSON.parse(x.slice(6)))
  assert.equal(ev2.at(-1).conversationId, done.conversationId)
  assert.ok(calls.at(-1).messages.some((m: any) => m.role === 'user' && m.content === 'Was steht heute an?'))
})

test('events: SSE sends message, health and card counts on connect', { timeout: 10_000 }, async () => {
  const ctl = new AbortController()
  const res = await fetch(`${s.url}/api/v1/events`, { headers: auth(token), signal: ctl.signal })
  assert.equal(res.status, 200)
  const reader = res.body!.getReader()
  let text = ''
  const types = new Set<string>()
  while (types.size < 3) {
    const { value } = await reader.read()
    text += new TextDecoder().decode(value)
    for (const part of text.split('\n\n')) if (part.startsWith('data: ')) types.add(JSON.parse(part.slice(6)).type)
  }
  ctl.abort()
  assert.deepEqual([...types].sort(), ['cards', 'health', 'message'])
  assert.match(text, /"todayCount":\d+/)
})
