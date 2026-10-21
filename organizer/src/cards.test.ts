import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CardSchema, cardKey, fromModel, slug, upsertCards, validate, type CardContext, type ModelCard } from './cards.js'
import { testDb } from './test-db.js'

const ctx: CardContext = {
  chatJid: '4915112345678@s.whatsapp.net',
  chatName: 'Tim',
  at: new Date('2026-10-20T16:00:00Z'),
  from: new Date('2026-10-18T10:00:00Z'),
  to: new Date('2026-10-20T16:00:00Z'),
}

const emptyData: ModelCard['data'] = { shopping: null, parcel: null, money: null, trip: null, place: null, address: null, birthday: null, insight: null }

const moneyCard = (over: Partial<ModelCard> = {}): ModelCard => ({
  type: 'money',
  subject: 'Konzertkarte',
  title: 'Tim hat für dich ausgelegt',
  say: 'Tim hat dir 38 € für die Konzertkarte ausgelegt.',
  context: null,
  urgency: 1,
  due: null,
  suggestions: [
    { label: 'Beglichen', kind: 'done', text: null, at: null },
    { label: 'Freitag erinnern', kind: 'remind', text: 'Tim 38 € zurückgeben', at: '2026-10-23T18:00:00' },
  ],
  data: { ...emptyData, money: { from: 'Du', to: 'Tim', amount: '38,00 €', note: null } },
  ...over,
})

const validCard = {
  key: 'card:link:abc:x', type: 'link', group: 'know', urgency: 1, state: 'new',
  title: 'Sarah teilt einen Artikel', source: { chat: 'Projekt', when: 'heute 11:02' },
  say: 'Sarah hat einen Artikel geteilt.',
  suggestions: [{ id: 'open', label: 'Öffnen', action: { kind: 'open', url: 'https://example.org/a' }, primary: true }],
  data: { url: 'https://example.org/a', domain: 'example.org', headline: 'Warum gute Formulare kurz sind' },
}

test('schema accepts a contract-shaped card', () => {
  assert.equal(CardSchema.safeParse(validCard).success, true)
})

test('schema rejects invalid cards', () => {
  const bad = [
    { ...validCard, say: '' },
    { ...validCard, urgency: 4 },
    { ...validCard, type: 'question' },
    { ...validCard, data: { url: 'not a url', domain: 'x', headline: 'y' } },
    { ...validCard, suggestions: [{ id: 'a', label: 'Senden', action: { kind: 'send' } }] },
    { ...validCard, suggestions: [{ id: 'a', label: 'Tanzen', action: { kind: 'dance' } }] },
    { ...validCard, type: 'parcel', data: { steps: ['Bestellt', 'Versandt'], current: 2, stats: [] } },
  ]
  for (const c of bad) assert.equal(CardSchema.safeParse(c).success, false, JSON.stringify(c))
  assert.ok('error' in validate({ ...validCard, title: '  ' }, null, null))
})

test('model card becomes a full contract card', () => {
  const r = fromModel(moneyCard({ urgency: 7 }), ctx)
  assert.ok('row' in r)
  const c = r.row.card
  assert.equal(c.type, 'money')
  assert.equal(c.group, 'todo')
  assert.equal(c.urgency, 3)
  assert.equal(c.state, 'new')
  assert.equal(c.source.chatJid, ctx.chatJid)
  assert.deepEqual(c.suggestions.map((s) => s.action.kind), ['done', 'remind'])
  assert.equal(c.suggestions[0].primary, true)
  assert.equal(r.row.chatJid, ctx.chatJid)
})

test('invalid model cards are dropped', () => {
  // data for the wrong type
  assert.ok('error' in fromModel(moneyCard({ data: { ...emptyData, place: { name: 'Halle', detail: null } } }), ctx))
  // empty title
  assert.ok('error' in fromModel(moneyCard({ title: '' }), ctx))
})

test('suggestions that cannot be executed are dropped, a done fallback is added', () => {
  const r = fromModel(moneyCard({ suggestions: [
    { label: 'Senden', kind: 'send', text: null, at: null },
    { label: 'Erinnern', kind: 'remind', text: 'x', at: 'irgendwann' },
    { label: 'Speichern', kind: 'save_contact', text: null, at: null },
  ] }), ctx)
  assert.ok('row' in r)
  assert.deepEqual(r.row.card.suggestions, [{ id: 'done', label: 'Erledigt', action: { kind: 'done' }, primary: true }])
})

test('keys are stable and keep phone numbers out', () => {
  assert.equal(cardKey('parcel', ctx.chatJid, 'Laufschuhe Zalando'), cardKey('parcel', ctx.chatJid, '  laufschuhe   ZALANDO! '))
  assert.equal(slug('Größe Überraschung für Oma'), 'groesse-ueberraschung-fuer-oma')
  assert.match(cardKey('parcel', ctx.chatJid, 'x'), /^card:parcel:[0-9a-f]{10}:x$/)
  assert.ok(!cardKey('parcel', ctx.chatJid, 'x').includes('4915112345678'))
  assert.notEqual(cardKey('parcel', ctx.chatJid, 'x'), cardKey('parcel', 'other@g.us', 'x'))
  // the same model card yields the same key on every run, even when the free-text subject drifts
  const a = fromModel(moneyCard(), ctx)
  const b = fromModel(moneyCard({ subject: 'Karte Konzert November' }), ctx)
  assert.ok('row' in a && 'row' in b)
  assert.equal(a.row.card.key, b.row.card.key)
})

test('birthday and address keys are person-scoped, not chat-scoped', () => {
  const bday = (chatJid: string) => fromModel({
    ...moneyCard(), type: 'birthday', subject: 'Oma 80', title: 'Oma wird 80', say: 'Oma wird am Freitag 80.',
    data: { ...emptyData, birthday: { person: 'Oma', age: 80, date: 'Fr 24.10.', ideas: ['Gartenbuch'], note: null } },
  }, { ...ctx, chatJid })
  const a = bday('family@g.us'), b = bday('mama@s.whatsapp.net')
  assert.ok('row' in a && 'row' in b)
  assert.equal(a.row.card.key, b.row.card.key)
  assert.equal(a.row.card.key, 'card:birthday:-:oma')
  assert.equal(a.row.card.type === 'birthday' && a.row.card.data.person.initials, 'OM')
})

test('upsert is idempotent and never resurrects done, dismissed or expired cards', async () => {
  const db = await testDb()
  const row = (amount: string) => {
    const r = fromModel(moneyCard({ data: { ...emptyData, money: { from: 'Du', to: 'Tim', amount, note: null } } }), ctx)
    assert.ok('row' in r)
    return r.row
  }
  assert.equal(await upsertCards(db, [row('38,00 €')]), 1)
  assert.equal(await upsertCards(db, [row('38,00 €')]), 0, 'unchanged payload is not rewritten')
  assert.equal(await upsertCards(db, [row('40,00 €')]), 1, 'open card is updated')
  const key = row('x').card.key
  for (const status of ['done', 'dismissed', 'expired']) {
    await db.query(`UPDATE cards SET status = $2 WHERE key = $1`, [key, status])
    assert.equal(await upsertCards(db, [row(`${status} 99 €`)]), 0)
    const r = await db.query(`SELECT status, payload->'data'->>'amount' AS amount, count(*) OVER () AS n FROM cards`)
    assert.equal(r.rows[0].status, status)
    assert.equal(r.rows[0].amount, '40,00 €')
    assert.equal(Number(r.rows[0].n), 1)
  }
})

test('upsert skips cards of excluded chats', async () => {
  const db = await testDb()
  await db.query(`INSERT INTO organizer_exclusions (chat_jid, reason) VALUES ($1, 'test')`, [ctx.chatJid])
  const r = fromModel(moneyCard(), ctx)
  assert.ok('row' in r)
  assert.equal(await upsertCards(db, [r.row]), 0)
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM cards`)).rows[0].n, 0)
})
