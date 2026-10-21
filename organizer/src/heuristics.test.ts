import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROMISE_RE, closeKeptPromises, extractUrls, followupCards, headlineOf, linkCards, photoCards, runCardRules } from './heuristics.js'
import { hoursAgo, msg, testDb } from './test-db.js'

const now = new Date('2026-10-21T12:00:00Z')
const ago = (h: number) => hoursAgo(h, now)

async function seed() {
  const db = await testDb()
  await db.query(`INSERT INTO chats (jid, name, is_group) VALUES ('jana@s', NULL, false), ('wg@g', 'WG Bremer Str.', true), ('secret@s', NULL, false)`)
  await db.query(`INSERT INTO contacts (jid, name) VALUES ('jana@s', 'Jana'), ('secret@s', 'Arzt'), ('lukas@s', 'Lukas'), ('mia@s', 'Mia')`)
  await db.query(`INSERT INTO organizer_exclusions (chat_jid, reason) VALUES ('secret@s', 'Name enthält "Arzt"')`)
  return db
}

test('promise detection', () => {
  for (const s of ['Ich melde mich morgen wegen der Wohnung!', 'schick ich dir heute Abend', 'Ich schicke dir die Folien', 'Meld mich später', 'ich sag dir bis Freitag Bescheid', 'Ich ruf dich morgen an'])
    assert.ok(PROMISE_RE.test(s), s)
  for (const s of ['Kannst du mir das schicken?', 'Meldest du dich?', 'Danke dir!', 'Hab mich angemeldet'])
    assert.ok(!PROMISE_RE.test(s), s)
})

test('followup: open promise without a later own message', async () => {
  const db = await seed()
  await msg(db, { chat: 'jana@s', ts: ago(130), body: 'Ist die Wohnung noch frei?' })
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(120), body: 'Ich melde mich morgen wegen der Wohnung!' })
  const rows = await followupCards(db, now)
  assert.equal(rows.length, 1)
  const c = rows[0].card
  assert.equal(c.type, 'followup')
  assert.equal(c.title, 'Du wolltest Jana zurückschreiben')
  assert.equal(c.type === 'followup' && c.data.days, 5)
  assert.equal(c.urgency, 2)
  assert.equal(rows[0].chatJid, 'jana@s')
})

test('followup: kept promise, too recent, or excluded chat gives no card', async () => {
  const db = await seed()
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(50), body: 'schick ich dir' })
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(30), body: 'Hier die Unterlagen' })
  await msg(db, { chat: 'wg@g', fromMe: true, ts: ago(2), body: 'Ich melde mich nachher' })
  await msg(db, { chat: 'secret@s', fromMe: true, ts: ago(48), body: 'Ich melde mich morgen' })
  assert.deepEqual(await followupCards(db, now), [])
})

test('followup card closes once you write again, and is not recreated', async () => {
  const db = await seed()
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(48), body: 'Ich melde mich morgen' })
  await runCardRules(db, now)
  assert.equal((await db.query(`SELECT status FROM cards WHERE type = 'followup'`)).rows[0].status, 'open')
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(1), body: 'So, hier bin ich' })
  assert.equal(await closeKeptPromises(db), 1)
  await runCardRules(db, now)
  const r = await db.query(`SELECT status FROM cards WHERE type = 'followup'`)
  assert.deepEqual(r.rows.map((x) => x.status), ['done'])
})

test('link extraction and headline', () => {
  assert.deepEqual(extractUrls('Schau mal: https://example.org/a-b. Und https://chat.whatsapp.com/XYZ').map(String), ['https://example.org/a-b'])
  const u = new URL('https://www.example.org/blog/warum-gute-formulare-kurz-sind.html')
  assert.equal(headlineOf(u, 'https://www.example.org/blog/warum-gute-formulare-kurz-sind.html'), 'Warum gute formulare kurz sind')
  assert.equal(headlineOf(u, 'Lesenswert zum Projekt https://www.example.org/x'), 'Lesenswert zum Projekt')
  assert.equal(headlineOf(new URL('https://www.example.org/p?id=3'), 'https://www.example.org/p?id=3'), 'example.org')
  assert.equal(headlineOf(u, '', 'Stored page title'), 'Stored page title')
})

test('link cards from shared URLs, excluded chats skipped', async () => {
  const db = await seed()
  await msg(db, { chat: 'wg@g', sender: 'mia@s', ts: ago(3), body: 'Lesenswert zum Projekt https://example.org/formulare' })
  await msg(db, { chat: 'wg@g', sender: 'mia@s', ts: ago(2), body: 'nochmal https://example.org/formulare' })
  await msg(db, { chat: 'secret@s', ts: ago(3), body: 'Befund: https://praxis.example/befund' })
  await msg(db, { chat: 'wg@g', fromMe: true, ts: ago(3), body: 'https://example.org/mine' })
  const rows = await linkCards(db, now)
  assert.equal(rows.length, 1)
  const c = rows[0].card
  assert.equal(c.type === 'link' && c.data.domain, 'example.org')
  assert.equal(c.title, 'Mia teilt einen Link')
  assert.deepEqual(c.suggestions[0].action, { kind: 'open', url: 'https://example.org/formulare' })
})

test('photo cards group images per chat and day', async () => {
  const db = await seed()
  for (let i = 0; i < 4; i++) await msg(db, { chat: 'wg@g', sender: 'lukas@s', ts: ago(5 + i * 0.1), type: 'image' })
  await msg(db, { chat: 'wg@g', sender: 'lukas@s', ts: ago(40), type: 'image' }) // another day, below minimum
  for (let i = 0; i < 5; i++) await msg(db, { chat: 'secret@s', ts: ago(5), type: 'image' })
  const rows = await photoCards(db, now)
  assert.equal(rows.length, 1)
  const c = rows[0].card
  assert.equal(c.title, 'Lukas hat 4 Fotos geteilt')
  assert.equal(c.type === 'photos' && c.data.count, 4)
  assert.match(c.key, /^card:photos:[0-9a-f]{10}:2026-10-21$/)
})

test('rules are idempotent', async () => {
  const db = await seed()
  await msg(db, { chat: 'jana@s', fromMe: true, ts: ago(48), body: 'Ich melde mich morgen' })
  for (let i = 0; i < 3; i++) await msg(db, { chat: 'wg@g', sender: 'lukas@s', ts: ago(5), type: 'image' })
  await runCardRules(db, now)
  const before = (await db.query(`SELECT key, updated_at FROM cards ORDER BY key`)).rows
  assert.equal(before.length, 2)
  await runCardRules(db, now)
  assert.deepEqual((await db.query(`SELECT key, updated_at FROM cards ORDER BY key`)).rows, before)
})
