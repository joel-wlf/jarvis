import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import type { Card } from '@jarvis/contract'
import { auth, fakeWorker, json, setOnline, start, testDb, type Running } from './helpers.js'
import { createDevice } from '../src/app/store.js'

let pg: PGlite
let s: Running
let token: string
let stopWorker: () => void

const ANNA = 'anna@s.whatsapp.net'
const GROUP = 'club@g.us'
const ago = (h: number) => new Date(Date.now() - h * 3600_000)

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
  await pg.exec(`TRUNCATE messages, chats, contacts, contact_profiles, watch_state, reminders, suggested_actions, outbox, poll_votes, topics, cards, reply_suggestions RESTART IDENTITY`)
  await setOnline(pg)
  await pg.query(`INSERT INTO contacts (jid, name) VALUES ($1, 'Anna Berg')`, [ANNA])
  await pg.query(`INSERT INTO chats (jid, name, is_group, last_message_at) VALUES ($1, 'Anna Berg', false, $3), ($2, 'Lauftreff', true, $3)`, [ANNA, GROUP, ago(3)])
  await pg.query(`INSERT INTO contact_profiles (jid, relationship, closeness) VALUES ($1, 'close_friend', 5)`, [ANNA])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ('m1', $1, $1, false, $2, 'text', 'Kommst du morgen mit zum Essen?')`, [ANNA, ago(3)])
  const poll = { message: { pollCreationMessageV3: { name: 'Wann laufen wir?', options: [{ optionName: 'Samstag' }, { optionName: 'Sonntag' }] } } }
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, raw) VALUES ('p1', $1, $2, false, $3, 'poll', 'Wann laufen wir?', $4)`, [GROUP, ANNA, ago(5), JSON.stringify(poll)])
  await pg.query(`INSERT INTO reminders (text, due_at) VALUES ('Paket abholen', $1)`, [ago(0.5)])
  await pg.query(`INSERT INTO suggested_actions (title, due_at) VALUES ('Miete überweisen', $1)`, [new Date(Date.now() + 86400_000)])
})

const cards = async (group?: string): Promise<Card[]> => (await (await fetch(`${s.url}/api/v1/cards${group ? `?group=${group}` : ''}`, { headers: auth(token) })).json()).cards
const actOn = (key: string, action: unknown) => fetch(`${s.url}/api/v1/cards/${encodeURIComponent(key)}/act`, json({ action }, auth(token)))
const byType = (cs: Card[], type: string) => cs.find((c) => c.type === type)!

test('cards are derived from SQL with watch keys and contract shape', async () => {
  const cs = await cards()
  const q = byType(cs, 'question')
  assert.match(q.key, new RegExp(`^frage:${ANNA}:\\d+$`))
  assert.equal(q.group, 'reply')
  assert.equal(q.urgency, 2)
  assert.equal(q.source.chatJid, ANNA)
  assert.equal((q.data as any).person.initials, 'AB')
  const poll = byType(cs, 'poll')
  assert.equal(poll.key, 'umfrage:p1')
  assert.deepEqual((poll.data as any).options.map((o: any) => o.label), ['Samstag', 'Sonntag'])
  assert.equal(byType(cs, 'reminder').key, 'reminder:1')
  assert.equal(byType(cs, 'task').key, 'aktion:1')
  assert.deepEqual((await cards('todo')).map((c) => c.type).sort(), ['poll', 'task'])
  const home = await (await fetch(`${s.url}/api/v1/home`, { headers: auth(token) })).json()
  assert.equal(home.counts.all, cs.length)
  assert.equal(home.modules.messages.incoming.length, 7)
})

test('snooze and dismiss write watch_state like watch_feedback', async () => {
  const q = byType(await cards(), 'question')
  const until = new Date(Date.now() + 3 * 3600_000).toISOString()
  const r = await actOn(q.key, { kind: 'snooze', until })
  assert.equal(r.status, 200)
  assert.deepEqual(Object.keys(await r.json()).sort(), ['message', 'ok', 'removed'])
  const ws = (await pg.query<any>(`SELECT * FROM watch_state WHERE key = $1`, [q.key])).rows[0]
  assert.equal(ws.dismissed, false)
  assert.equal(new Date(ws.snoozed_until).toISOString(), until)
  assert.equal((await cards()).some((c) => c.key === q.key), false)

  await actOn('umfrage:p1', { kind: 'dismiss' })
  assert.equal((await pg.query<any>(`SELECT dismissed FROM watch_state WHERE key = 'umfrage:p1'`)).rows[0].dismissed, true)
  // unknown (already gone) card
  assert.equal((await actOn('umfrage:p1', { kind: 'dismiss' })).status, 404)
})

test('done and dismiss on reminders and tasks update their own tables', async () => {
  assert.equal((await actOn('reminder:1', { kind: 'done' })).status, 200)
  assert.equal((await pg.query<any>(`SELECT status FROM reminders WHERE id = 1`)).rows[0].status, 'done')
  assert.equal((await actOn('aktion:1', { kind: 'dismiss' })).status, 200)
  assert.equal((await pg.query<any>(`SELECT status FROM suggested_actions WHERE id = 1`)).rows[0].status, 'dismissed')
  // only the learning counters (prefs.ts) are written, never a dismiss entry for the task itself
  assert.deepEqual((await pg.query<any>(`SELECT key FROM watch_state ORDER BY key`)).rows.map((r) => r.key), ['learn:type:task'])
})

test('remind creates a reminder referencing the card', async () => {
  const q = byType(await cards(), 'question')
  const at = new Date(Date.now() + 7200_000).toISOString()
  const r = await actOn(q.key, { kind: 'remind', at, text: 'Anna antworten' })
  assert.equal((await r.json()).removed, false)
  const rem = (await pg.query<any>(`SELECT text, due_at, ref, status FROM reminders WHERE ref = $1`, [q.key])).rows[0]
  assert.equal(rem.text, 'Anna antworten')
  assert.equal(rem.status, 'open')
  assert.equal(new Date(rem.due_at).toISOString(), at)
})

test('send and vote go through the outbox', async () => {
  const q = byType(await cards(), 'question')
  const sent = await actOn(q.key, { kind: 'send', text: 'Klar, bin dabei!' })
  assert.equal(sent.status, 200)
  assert.deepEqual(await sent.json(), { ok: true, message: 'Sent.', removed: true }) // English without Accept-Language
  const job = (await pg.query<any>(`SELECT kind, chat_jid, payload FROM outbox ORDER BY id DESC LIMIT 1`)).rows[0]
  assert.equal(job.kind, 'send_text')
  assert.equal(job.chat_jid, ANNA)
  assert.equal(job.payload.text, 'Klar, bin dabei!')

  assert.equal((await actOn('umfrage:p1', { kind: 'vote', option: 'Elfmeter', pollId: 'p1' })).status, 400)
  const voted = await actOn('umfrage:p1', { kind: 'vote', option: 'sonntag', pollId: 'p1' })
  assert.equal(voted.status, 200)
  const v = (await pg.query<any>(`SELECT kind, chat_jid, payload FROM outbox ORDER BY id DESC LIMIT 1`)).rows[0]
  assert.deepEqual([v.kind, v.chat_jid, v.payload], ['vote', GROUP, { poll_id: 'p1', options: ['Sonntag'] }])
})

test('send refuses when WhatsApp is offline and queues nothing', async () => {
  await pg.query(`UPDATE meta SET value = 'close' WHERE key = 'wa_status'`)
  const q = byType(await cards(), 'question')
  const r = await actOn(q.key, { kind: 'send', text: 'Hallo' })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).error.code, 'unavailable')
  assert.equal((await pg.query(`SELECT 1 FROM outbox`)).rows.length, 0)
})

test('organizer cards from the cards table are merged and can be done', async () => {
  const payload = { title: 'Paket kommt heute', source: { chat: 'DHL', when: 'heute' }, say: 'Dein Paket kommt.', suggestions: [], data: { steps: ['a', 'b'], current: 1, stats: [] } }
  await pg.query(`INSERT INTO cards (type, key, payload) VALUES ('parcel', 'parcel:42', $1)`, [JSON.stringify(payload)])
  const c = (await cards('todo')).find((x) => x.key === 'parcel:42')!
  assert.equal(c.type, 'parcel')
  assert.equal(c.state, 'new')
  await actOn('parcel:42', { kind: 'done' })
  assert.equal((await pg.query<any>(`SELECT status FROM cards WHERE key = 'parcel:42'`)).rows[0].status, 'done')
})

test('people, person patch and memories CRUD', async () => {
  const ppl = (await (await fetch(`${s.url}/api/v1/people`, { headers: auth(token) })).json()).people
  const anna = ppl.find((p: any) => p.jid === ANNA)
  assert.equal(anna.relationship, 'close_friend')
  assert.ok(anna.openCards >= 1)
  const patch = await fetch(`${s.url}/api/v1/people/${ANNA}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ relationship: 'club', realName: 'Anna', closeness: 9 }) })
  assert.equal(patch.status, 400)
  assert.ok((await patch.json()).error.fields.closeness)
  const ok = await fetch(`${s.url}/api/v1/people/${ANNA}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ relationship: 'club', aliases: ['Anni'] }) })
  const d = await ok.json()
  assert.equal(d.relationship, 'club')
  assert.equal(d.locked, true)
  assert.equal(d.source, 'user')
  assert.equal((await pg.query<any>(`SELECT relationship FROM contact_profiles WHERE jid = $1`, [ANNA])).rows[0].relationship, 'community')

  const created = await fetch(`${s.url}/api/v1/memories`, json({ content: 'Anna isst kein Fleisch', scope: 'contact', contactJid: ANNA }, auth(token)))
  assert.equal(created.status, 201)
  const m = await created.json()
  assert.equal(m.scopeLabel, 'Anna Berg')
  const p = await fetch(`${s.url}/api/v1/memories/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ pinned: true }) })
  assert.equal((await p.json()).pinned, true)
  const list = (await (await fetch(`${s.url}/api/v1/memories?q=Fleisch`, { headers: auth(token) })).json()).memories
  assert.equal(list.length, 1)
  assert.equal((await fetch(`${s.url}/api/v1/memories/${m.id}`, { method: 'DELETE', headers: auth(token) })).status, 204)
  assert.equal((await fetch(`${s.url}/api/v1/memories/${m.id}`, { method: 'DELETE', headers: auth(token) })).status, 404)
})
