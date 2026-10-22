import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import { auth, fakeWorker, setOnline, start, testDb, type Running } from './helpers.js'
import { createDevice } from '../src/app/store.js'
import { registerCardTools } from '../src/card-tools.js'
import { registerDashboardTool } from '../src/dashboard.js'

let pg: PGlite
let s: Running
let token: string
let stopWorker: () => void

const ANNA = 'anna@s.whatsapp.net'
const GROUP = 'garden@g.us'
const ago = (h: number) => new Date(Date.now() - h * 3600_000)

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>
const handlers = new Map<string, Handler>()
registerCardTools({ registerTool: (name: string, _meta: unknown, h: Handler) => void handlers.set(name, h) } as never)
let dashboardHandler: Handler
registerDashboardTool({ registerTool: (_n: string, _m: unknown, h: Handler) => void (dashboardHandler = h) } as never)

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await handlers.get(name)!(args)
  return { error: !!r.isError, text: r.content[0]!.text }
}
const callJson = async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await call(name, args)).text)
const dashboard = async () => JSON.parse((await dashboardHandler({})).content[0]!.text)
const put = (key: string, body: unknown) =>
  fetch(`${s.url}/api/v1/cards/${encodeURIComponent(key)}/priority`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })

before(async () => {
  pg = await testDb()
  s = await start()
  token = (await createDevice('Test', 'ios')).token
  stopWorker = fakeWorker(pg)
})
after(async () => {
  stopWorker()
  await s.close()
  await pg.close()
})

beforeEach(async () => {
  await pg.exec(`TRUNCATE messages, chats, contacts, contact_profiles, watch_state, reminders, suggested_actions, outbox, poll_votes, topics, threads, cards, reply_suggestions RESTART IDENTITY CASCADE`)
  await setOnline(pg)
  await pg.query(`INSERT INTO contacts (jid, name) VALUES ($1, 'Anna Berg')`, [ANNA])
  await pg.query(`INSERT INTO chats (jid, name, is_group, last_message_at) VALUES ($1, 'Anna Berg', false, $3), ($2, 'Gartenverein', true, $3)`, [ANNA, GROUP, ago(3)])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ('m1', $1, $1, false, $2, 'text', 'Kommst du morgen mit zum Essen?')`, [ANNA, ago(3)])
  await pg.query(`INSERT INTO threads (chat_jid, title, summary, status) VALUES ($1, 'Herbstschnitt', 'Am Samstag ist Herbstschnitt am Bethaus.', 'open')`, [GROUP])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, thread_id) VALUES ('h1', $1, 'lena@s.whatsapp.net', false, $2, 'text', 'Samstag 10 Uhr Herbstschnitt am Bethaus!', 1)`, [GROUP, ago(9)])
  await pg.query(`INSERT INTO suggested_actions (title, detail, due_at, thread_id) VALUES ('Termin: Herbstschnitt', 'Ort: Bethaus', $1, 1), ('Aufgabe: Heckenschere mitbringen', 'Herbstschnitt', NULL, 1)`, [new Date(Date.now() + 3 * 86400_000)])
})

test('list_cards returns the feed of the app with prepared steps, and filters', async () => {
  const all = await callJson('list_cards')
  const appKeys = ((await (await fetch(`${s.url}/api/v1/cards`, { headers: auth(token) })).json()) as { cards: { key: string }[] }).cards.map((c) => c.key)
  assert.deepEqual(all.cards.map((c: any) => c.key), appKeys)
  const event = all.cards.find((c: any) => c.key === 'aktion:1')
  assert.equal(event.type, 'event')
  assert.equal(event.chat, 'Gartenverein')
  assert.ok(event.suggestions.some((x: any) => x.id === 'noted' && x.action.kind === 'done'))
  assert.deepEqual((await callJson('list_cards', { type: 'task' })).cards.map((c: any) => c.key), ['aktion:2'])
  assert.deepEqual((await callJson('list_cards', { group: 'reply' })).cards.map((c: any) => c.type), ['question'])
  assert.equal((await callJson('list_cards', { limit: 1 })).cards.length, 1)
})

test('what the owner marked in the app counts for Claude too', async () => {
  const q = (await callJson('list_cards', { type: 'question' })).cards[0]
  assert.equal(q.owner_priority, null)
  await put(q.key, { priority: 3 })
  const after = (await callJson('list_cards', { type: 'question' })).cards[0]
  assert.equal(after.owner_priority, 3)
  assert.equal(after.urgency, 3)
})

test('get_card adds the data and the background; unknown keys explain themselves', async () => {
  const c = await callJson('get_card', { key: 'aktion:1' })
  assert.equal(c.data.place, 'Bethaus')
  assert.match(c.background.summary, /Herbstschnitt/)
  assert.match(c.background.messages[0].text, /Bethaus/)
  assert.match(c.hinweis, /Dritter/)
  const missing = await call('get_card', { key: 'aktion:99' })
  assert.equal(missing.error, true)
  assert.match(missing.text, /list_cards/)
})

test('act_on_card runs a prepared step like a tap in the app', async () => {
  const r = await call('act_on_card', { key: 'aktion:2', suggestion_id: 'done', confirm: true })
  assert.equal(r.error, false)
  assert.equal((await pg.query<any>(`SELECT status FROM suggested_actions WHERE id = 2`)).rows[0].status, 'done')
  assert.equal((await callJson('list_cards', { type: 'task' })).cards.length, 0)
})

test('act_on_card refuses unknown steps and lists the possible ones', async () => {
  const r = await call('act_on_card', { key: 'aktion:1', suggestion_id: 'nope', confirm: true })
  assert.equal(r.error, true)
  assert.match(r.text, /noted/)
})

test('snoozing a question changes only Jarvis\' own state and sends nothing', async () => {
  const q = (await callJson('list_cards', { type: 'question' })).cards[0]
  const r = await call('act_on_card', { key: q.key, suggestion_id: 'snooze-3h', confirm: true })
  assert.equal(r.error, false)
  assert.equal((await pg.query(`SELECT 1 FROM outbox`)).rows.length, 0)
  assert.equal((await callJson('list_cards', { type: 'question' })).cards.length, 0)
  assert.ok((await pg.query<any>(`SELECT snoozed_until FROM watch_state WHERE key = $1`, [q.key])).rows[0].snoozed_until)
})

test('a written reply is previewed without confirm and queued with it', async () => {
  // organizer cards can carry a written reply: store one and send it
  const key = 'card:followup:test:reply'
  const card = {
    key, type: 'followup', group: 'reply', urgency: 2, state: 'new', title: 'Du wolltest Anna zurückschreiben',
    source: { chat: 'Anna Berg', chatJid: ANNA, when: 'gestern' }, say: 'Du hast Anna gestern geschrieben.',
    suggestions: [{ id: 'a', label: 'Jetzt melden', action: { kind: 'send', text: 'Sorry, melde mich gleich!' }, primary: true }],
    data: { days: 1, promise: 'ich melde mich', promisedAt: 'Du, gestern' },
  }
  await pg.query(`INSERT INTO cards (type, key, payload, chat_jid) VALUES ('followup', $1, $2, $3)`, [key, JSON.stringify(card), ANNA])
  const preview = await call('act_on_card', { key, suggestion_id: 'a', confirm: false })
  assert.match(preview.text, /VORSCHAU[\s\S]*Sorry, melde mich gleich!/)
  assert.equal((await pg.query(`SELECT 1 FROM outbox`)).rows.length, 0)
  const sent = await call('act_on_card', { key, suggestion_id: 'a', confirm: true })
  assert.equal(sent.error, false, sent.text)
  const job = (await pg.query<any>(`SELECT kind, chat_jid, payload FROM outbox`)).rows[0]
  assert.equal(job.kind, 'send_text')
  assert.equal(job.chat_jid, ANNA)
  assert.equal(job.payload.text, 'Sorry, melde mich gleich!')
})

test('get_dashboard keeps its shape, now from the shared feed: events from chats, tasks, more, rules', async () => {
  const d = await dashboard()
  assert.ok(d.events.some((e: any) => e.key === 'aktion:1' && e.title === 'Herbstschnitt' && e.chat === 'Gartenverein'))
  assert.ok(d.actions.some((a: any) => a.key === 'aktion:2' && a.title === 'Heckenschere mitbringen'))
  assert.ok(d.questions.some((q: any) => q.chat_jid === ANNA && /Essen/.test(q.body)))
  assert.ok(Array.isArray(d.more) && Array.isArray(d.muted))

  // a chat the owner set to "later" is listed but never reported
  await pg.query(`INSERT INTO watch_state (key, priority, note) VALUES ($1, 1, 'user')`, [`rule:chat:${GROUP}`])
  const later = await dashboard()
  assert.ok(!later.to_notify.includes('aktion:1'))
  // hidden: gone from the feed, and the rule itself is not listed as muted
  await pg.query(`UPDATE watch_state SET priority = NULL, dismissed = true WHERE key = $1`, [`rule:chat:${GROUP}`])
  const hidden = await dashboard()
  assert.ok(!hidden.events.some((e: any) => e.key === 'aktion:1'))
  assert.ok(!hidden.muted.some((m: any) => /^rule:/.test(m.key)))
})

test('over a real MCP connection the card tools are listed with schemas and work', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
  const { buildServer } = await import('../src/tools.js')
  const server = await buildServer()
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([server.connect(serverT), client.connect(clientT)])
  try {
    const names = (await client.listTools()).tools.map((t) => t.name)
    for (const n of ['list_cards', 'get_card', 'act_on_card', 'get_dashboard']) assert.ok(names.includes(n), n)
    const r = (await client.callTool({ name: 'list_cards', arguments: { type: 'event' } })) as { content: { text: string }[] }
    assert.equal(JSON.parse(r.content[0]!.text).cards[0].key, 'aktion:1')
    // the schema's default applies over the wire: no confirm given -> runs at once (REQUIRE_CONFIRM is not set)
    const done = (await client.callTool({ name: 'act_on_card', arguments: { key: 'aktion:2', suggestion_id: 'done' } })) as { content: { text: string }[]; isError?: boolean }
    assert.ok(!done.isError, done.content[0]!.text)
    assert.equal((await pg.query<any>(`SELECT status FROM suggested_actions WHERE id = 2`)).rows[0].status, 'done')
  } finally {
    await client.close()
  }
})
