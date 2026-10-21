import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import type { Card, CardContextResponse, PreferencesResponse, StatusResponse } from '@jarvis/contract'
import { auth, fakeWorker, json, setOnline, start, testDb, type Running } from './helpers.js'
import { createDevice } from '../src/app/store.js'
import { actionKind, niceName } from '../src/app/cards.js'

let pg: PGlite
let s: Running
let token: string
let stopWorker: () => void

const GROUP = 'garden@g.us'
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
  await pg.exec(`TRUNCATE messages, chats, contacts, contact_profiles, watch_state, reminders, suggested_actions, outbox, poll_votes, topics, threads, cards, reply_suggestions RESTART IDENTITY CASCADE`)
  await setOnline(pg)
  await pg.query(`INSERT INTO chats (jid, name, is_group, last_message_at) VALUES ($1, 'Gartenverein', true, $2)`, [GROUP, ago(3)])
  await pg.query(`INSERT INTO threads (chat_jid, title, summary, status) VALUES ($1, 'Herbstschnitt', 'Am Samstag ist Herbstschnitt am Bethaus.', 'open')`, [GROUP])
  await pg.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, thread_id) VALUES ('h1', $1, 'lena@s.whatsapp.net', false, $2, 'text', 'Samstag 10 Uhr Herbstschnitt am Bethaus!', 1)`, [GROUP, ago(9)])
  const sat = new Date(Date.now() + 3 * 86400_000)
  await pg.query(`INSERT INTO suggested_actions (title, detail, due_at, thread_id) VALUES ('Termin: Herbstschnitt', 'Ort: Bethaus · Herbstschnitt am Samstag', $1, 1), ('Aufgabe: Heckenschere mitbringen', 'Herbstschnitt', NULL, 1)`, [sat])
})

const get = async <T>(path: string): Promise<T> => (await fetch(`${s.url}/api/v1${path}`, { headers: { ...auth(token), 'Accept-Language': 'de' } })).json() as Promise<T>
const cards = async () => (await get<{ cards: Card[] }>('/cards')).cards
const act = (key: string, action: unknown) => fetch(`${s.url}/api/v1/cards/${encodeURIComponent(key)}/act`, json({ action }, { ...auth(token), 'Accept-Language': 'de' }))

test('organizer "Termin:" suggestions become dated event cards from their chat, "Aufgabe:" stays a task', async () => {
  const cs = await cards()
  const ev = cs.find((c) => c.key === 'aktion:1')!
  assert.equal(ev.type, 'event')
  assert.equal(ev.group, 'schedule')
  assert.equal(ev.title, 'Herbstschnitt')
  assert.equal(ev.source.chat, 'Gartenverein')
  assert.equal((ev.data as any).place, 'Bethaus')
  // a fixed date: take note or see it again before the day, never "in 3 hours"
  assert.deepEqual(ev.suggestions.map((x) => x.id).filter((id) => !id.startsWith('snooze-')).sort(), ['dismiss', 'noted'])
  assert.ok(ev.suggestions.some((x) => x.id === 'snooze-daybefore'))
  const task = cs.find((c) => c.key === 'aktion:2')!
  assert.equal(task.type, 'task')
  assert.equal(task.title, 'Heckenschere mitbringen')
  assert.equal(task.source.chat, 'Gartenverein')
})

test('the background of a card shows the thread summary and the original messages', async () => {
  const ctx = await get<CardContextResponse>(`/cards/${encodeURIComponent('aktion:1')}/context`)
  assert.equal(ctx.chat, 'Gartenverein')
  assert.match(ctx.summary ?? '', /Bethaus/)
  assert.equal(ctx.messages.length, 1)
  assert.match(ctx.messages[0]!.text, /Herbstschnitt/)
  assert.equal(ctx.messages[0]!.fromMe, false)
})

test('three "unimportant" in one chat teach a "later" rule that the owner can see, change and remove', async () => {
  await pg.query(`INSERT INTO suggested_actions (title, thread_id) VALUES ('Aufgabe: Laub rechen', 1), ('Aufgabe: Kuchen backen', 1)`)
  for (const key of ['aktion:2', 'aktion:3']) assert.equal((await act(key, { kind: 'dismiss' })).status, 200)
  const third = await (await act('aktion:4', { kind: 'dismiss' })).json()
  assert.match(third.message, /Gartenverein/)
  // the event card from the same chat now shows as "later"
  assert.equal((await cards()).find((c) => c.key === 'aktion:1')!.urgency, 1)
  const prefs = await get<PreferencesResponse>('/preferences')
  assert.equal(prefs.learning, true)
  assert.deepEqual(prefs.rules.map((r) => [r.kind, r.target, r.priority, r.source, r.label]), [['chat', GROUP, 1, 'learned', 'Gartenverein']])

  // the owner hides the chat instead: the card leaves the feed, nothing is deleted
  await fetch(`${s.url}/api/v1/preferences/rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ kind: 'chat', target: GROUP, priority: null, hidden: true }) })
  assert.equal((await cards()).find((c) => c.key === 'aktion:1'), undefined)
  assert.equal((await pg.query<any>(`SELECT status FROM suggested_actions WHERE id = 1`)).rows[0].status, 'open')

  // removing the rule brings the card back and starts learning over
  const after = await (await fetch(`${s.url}/api/v1/preferences/rules/${encodeURIComponent(`rule:chat:${GROUP}`)}`, { method: 'DELETE', headers: auth(token) })).json() as PreferencesResponse
  assert.deepEqual(after.rules, [])
  assert.ok((await cards()).find((c) => c.key === 'aktion:1'))
  assert.equal((await pg.query(`SELECT 1 FROM watch_state WHERE key = $1`, [`learn:chat:${GROUP}`])).rows.length, 0)
})

test('learning can be switched off', async () => {
  await fetch(`${s.url}/api/v1/preferences/learning`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify({ enabled: false }) })
  await pg.query(`INSERT INTO suggested_actions (title, thread_id) VALUES ('Aufgabe: A', 1), ('Aufgabe: B', 1)`)
  for (const key of ['aktion:2', 'aktion:3', 'aktion:4']) await act(key, { kind: 'dismiss' })
  const prefs = await get<PreferencesResponse>('/preferences')
  assert.equal(prefs.learning, false)
  assert.deepEqual(prefs.rules, [])
})

test('status reports the pipeline steps', async () => {
  const st = await get<StatusResponse>('/status')
  assert.equal(st.messages, 1)
  assert.equal(st.chats, 1)
  assert.deepEqual(st.steps.map((x) => x.id), ['import', 'transcripts', 'images', 'search', 'organizer', 'people'])
  assert.equal(st.steps.find((x) => x.id === 'search')!.total, 1)
})

test('helpers: action prefixes and readable names', () => {
  assert.deepEqual(actionKind('Termin: Besprechung'), { kind: 'event', title: 'Besprechung' })
  assert.deepEqual(actionKind('Aufgabe: Miete überweisen'), { kind: 'task', title: 'Miete überweisen' })
  assert.deepEqual(actionKind('Miete überweisen'), { kind: 'task', title: 'Miete überweisen' })
  assert.equal(niceName('4915112345678@s.whatsapp.net'), '+49 151 12345678')
  assert.equal(niceName('123456789@lid', 'de'), 'Unbekannter Kontakt')
  assert.equal(niceName('Lena'), 'Lena')
})
