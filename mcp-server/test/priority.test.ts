import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import type { Card } from '@jarvis/contract'
import { auth, setOnline, start, testDb, type Running } from './helpers.js'
import { createDevice } from '../src/app/store.js'
import { registerDashboardTool } from '../src/dashboard.js'
import { loadWatchState, priorityKey, priorityOf, resetWatchFeedback, setPriority, setWatchFeedback } from '../src/watch.js'

let pg: PGlite
let s: Running
let token: string

const ANNA = 'anna@s.whatsapp.net'
const GROUP = 'club@g.us'
const ago = (h: number) => new Date(Date.now() - h * 3600_000)

before(async () => {
  pg = await testDb()
  s = await start()
  token = (await createDevice('Test', 'ios')).token
})
after(async () => {
  await s.close()
  await pg.close()
})

beforeEach(async () => {
  await pg.exec(`TRUNCATE messages, chats, contacts, contact_profiles, watch_state, reminders, suggested_actions, outbox, poll_votes, topics, cards, reply_suggestions RESTART IDENTITY`)
  await setOnline(pg)
  await pg.query(`INSERT INTO contacts (jid, name) VALUES ($1, 'Anna Berg')`, [ANNA])
  await pg.query(`INSERT INTO chats (jid, name, is_group, last_message_at) VALUES ($1, 'Anna Berg', false, $3), ($2, 'Lauftreff', true, $3)`, [ANNA, GROUP, ago(3)])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ('m1', $1, $1, false, $2, 'text', 'Kommst du morgen mit zum Essen?')`, [ANNA, ago(3)])
  const poll = (name: string) => JSON.stringify({ message: { pollCreationMessageV3: { name, options: [{ optionName: 'Samstag' }, { optionName: 'Sonntag' }] } } })
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, raw) VALUES ('p1', $1, $2, false, $3, 'poll', 'Wann laufen wir?', $4)`, [GROUP, ANNA, ago(5), poll('Wann laufen wir?')])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, raw) VALUES ('p2', $1, $2, false, $3, 'poll', 'Altes Thema', $4)`, [GROUP, ANNA, ago(24 * 4), poll('Altes Thema')])
})

const cards = async (): Promise<Card[]> => (await (await fetch(`${s.url}/api/v1/cards`, { headers: auth(token) })).json()).cards
const put = (key: string, body: unknown) =>
  fetch(`${s.url}/api/v1/cards/${encodeURIComponent(key)}/priority`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) })

/** Runs get_dashboard without an MCP transport. */
async function dashboard() {
  let handler: (() => Promise<{ content: { text: string }[] }>) | undefined
  registerDashboardTool({ registerTool: (_n: string, _m: unknown, h: typeof handler) => void (handler = h) } as never)
  return JSON.parse((await handler!()).content[0].text)
}

test('PUT priority overrides the card urgency, reorders the list and can be reset', async () => {
  const before = await cards()
  const question = before.find((c) => c.type === 'question')!
  assert.equal(question.urgency, 2)

  assert.equal((await put('umfrage:p1', { priority: 3 })).status, 200)
  const high = await cards()
  assert.equal(high[0]!.key, 'umfrage:p1')
  assert.equal(high[0]!.urgency, 3)

  assert.equal((await put(question.key, { priority: 1 })).status, 200)
  assert.equal((await cards()).find((c) => c.key === question.key)!.urgency, 1)

  assert.deepEqual(await (await put(question.key, { priority: null })).json(), { ok: true, priority: null })
  assert.equal((await cards()).find((c) => c.key === question.key)!.urgency, 2)
  // nothing but the poll's priority stays in watch_state
  assert.deepEqual((await pg.query<any>(`SELECT key FROM watch_state`)).rows.map((r) => r.key), ['umfrage:p1'])
})

test('PUT priority validates the value and the card', async () => {
  assert.equal((await put('umfrage:p1', { priority: 4 })).status, 400)
  assert.equal((await put('umfrage:p1', { priority: 'high' })).status, 400)
  assert.equal((await put('umfrage:p1', {})).status, 400)
  assert.equal((await put('umfrage:gibt-es-nicht', { priority: 3 })).status, 404)
})

test('the watch service reports important items always and never the ones set to later', async () => {
  const d0 = await dashboard()
  const q = d0.questions[0].key
  assert.ok(d0.to_notify.includes(q))
  assert.ok(d0.to_notify.includes('umfrage:p1'))
  // a poll older than 3 days is not reported by default ...
  assert.ok(!d0.to_notify.includes('umfrage:p2'))

  await put('umfrage:p2', { priority: 3 })
  await put(q, { priority: 1 })
  const d1 = await dashboard()
  // ... but is when the owner marked it important, while a question set to later is listed but not reported
  assert.ok(d1.to_notify.includes('umfrage:p2'))
  assert.ok(!d1.to_notify.includes(q))
  assert.equal(d1.questions[0].priority, 1)
  assert.equal(d1.polls.find((p: any) => p.id === 'p2').priority, 3)
  assert.equal(d1.polls.find((p: any) => p.id === 'p1').priority, null)
})

test('priority survives dismiss, snooze and reset, and the event key follows the stage', async () => {
  await setPriority('umfrage:p1', 3)
  await setWatchFeedback('umfrage:p1', 'dismiss')
  await resetWatchFeedback('umfrage:p1')
  const rows = await loadWatchState()
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.dismissed, false)
  assert.equal(priorityOf('umfrage:p1', rows), 3)

  assert.equal(priorityKey('event:12:vortag'), 'event:12')
  assert.equal(priorityKey('umfrage:p1'), 'umfrage:p1')
  await setPriority('event:12', 3)
  const rows2 = await loadWatchState()
  assert.equal(priorityOf('event:12:kurz', rows2), 3)
  assert.equal(priorityOf('event:13:kurz', rows2), undefined)
})
