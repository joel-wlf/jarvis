import { createHash } from 'node:crypto'
import { z } from 'zod'
import { OWNER, OWNER_GEN } from './config.js'
import { TZ, log, parseDate, sanitizeYear, type Queryable } from './lib.js'

// Typed cards for the app's home feed (packages/contract/src/cards.ts). The organizer produces the types in
// ORGANIZER_CARD_TYPES into the `cards` table; payload is the full Card object. The Dockerfile builds this
// package on its own, so the contract types are mirrored here as zod schemas: keep both in sync.

export const ORGANIZER_CARD_TYPES = ['shopping', 'parcel', 'money', 'followup', 'trip', 'place', 'address', 'link', 'photos', 'birthday', 'insight'] as const
export type OrganizerCardType = (typeof ORGANIZER_CARD_TYPES)[number]

/** Types the topic model may produce; followup, link and photos come from cheap rules (heuristics.ts). */
export const MODEL_CARD_TYPES = ['shopping', 'parcel', 'money', 'trip', 'place', 'address', 'birthday', 'insight'] as const
export type ModelCardType = (typeof MODEL_CARD_TYPES)[number]

export const CARD_GROUP = {
  followup: 'reply',
  birthday: 'schedule', trip: 'schedule', place: 'schedule',
  shopping: 'todo', parcel: 'todo', money: 'todo',
  insight: 'know', address: 'know', link: 'know', photos: 'know',
} as const satisfies Record<OrganizerCardType, 'reply' | 'schedule' | 'todo' | 'know'>

// ---------------------------------------------------------------- contract mirror

const text = z.string().trim().min(1)
const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'ISO timestamp expected')
const Stat = z.object({ label: text, value: text })
const Person = z.object({ name: text, initials: text, jid: z.string().optional() })

export const CardAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('send'), text }),
  z.object({ kind: z.literal('react'), emoji: text, messageId: text }),
  z.object({ kind: z.literal('vote'), option: text, pollId: text }),
  z.object({ kind: z.literal('done') }),
  z.object({ kind: z.literal('snooze'), until: iso }),
  z.object({ kind: z.literal('dismiss') }),
  z.object({ kind: z.literal('remind'), at: iso, text }),
  z.object({ kind: z.literal('save_contact'), name: text, lines: z.array(text).min(1) }),
  z.object({ kind: z.literal('open'), url: z.string().url() }),
])
const Suggestion = z.object({ id: text, label: text, action: CardAction, primary: z.boolean().optional() })
const CardSource = z.object({ chat: text, chatJid: z.string().optional(), when: text, at: iso.optional() })

const DATA = {
  shopping: z.object({ items: z.array(z.object({ name: text, who: z.string().optional(), done: z.boolean() })).min(1) }),
  parcel: z.object({ steps: z.array(text).min(2), current: z.number().int().min(0), window: z.string().optional(), stats: z.array(Stat) })
    .refine((d) => d.current < d.steps.length, 'current out of range'),
  money: z.object({ from: text, to: text, amount: text, note: z.string().optional() }),
  followup: z.object({ days: z.number().int().min(0), promise: text, promisedAt: text, note: z.string().optional() }),
  trip: z.object({ depart: text, arrive: text, fromCity: text, toCity: text, track: z.string().optional(), delayMin: z.number().int().optional(), change: text, duration: z.string().optional() }),
  place: z.object({ name: text, detail: z.string().optional(), lat: z.number().optional(), lon: z.number().optional() }),
  address: z.object({ lines: z.array(text).min(2) }),
  link: z.object({ url: z.string().url(), domain: text, headline: text, readingTime: z.string().optional() }),
  photos: z.object({ count: z.number().int().min(1), withOwner: z.number().int().min(0), thumbnails: z.array(z.string()) }),
  birthday: z.object({ person: Person, age: z.number().int().positive().optional(), date: text, ideas: z.array(text), note: z.string().optional() }),
  insight: z.object({ text, sources: z.array(text) }),
} satisfies Record<OrganizerCardType, z.ZodType>

const cardOf = <T extends OrganizerCardType>(type: T) =>
  z.object({
    key: text,
    type: z.literal(type),
    group: z.enum(['reply', 'schedule', 'todo', 'know']),
    urgency: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    state: z.enum(['new', 'notified', 'scheduled']),
    title: text,
    source: CardSource,
    say: text,
    context: z.string().optional(),
    suggestions: z.array(Suggestion),
    data: DATA[type],
  })

export const CardSchema = z.discriminatedUnion('type', [
  cardOf('shopping'), cardOf('parcel'), cardOf('money'), cardOf('followup'), cardOf('trip'), cardOf('place'),
  cardOf('address'), cardOf('link'), cardOf('photos'), cardOf('birthday'), cardOf('insight'),
])
export type OrganizerCard = z.infer<typeof CardSchema>

// ---------------------------------------------------------------- keys

/** Short, stable tag for a chat: keeps phone numbers out of card keys (they end up in URLs and logs). */
export const chatTag = (jid: string) => createHash('sha256').update(jid).digest('hex').slice(0, 10)

export function slug(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return out || createHash('sha256').update(s).digest('hex').slice(0, 12)
}

/**
 * Key scheme: `card:<type>:<chat tag or "-">:<subject slug>`. Person-scoped types (birthday, address) use "-" as chat,
 * so the same birthday mentioned in two chats is one card.
 */
export function cardKey(type: OrganizerCardType, chatJid: string | null, subject: string): string {
  return `card:${type}:${chatJid ? chatTag(chatJid) : '-'}:${slug(subject)}`
}

// ---------------------------------------------------------------- formatting

const whenParts = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "Sa 25.10." or "Sa 25.10. 18:00" in local time; the API may re-render `source.when` from `source.at`. */
export function whenLabel(d: Date, withTime = true): string {
  const p = Object.fromEntries(whenParts.formatToParts(d).map((x) => [x.type, x.value]))
  const day = `${p.weekday.replace('.', '')} ${p.day}.${p.month}.`
  const time = `${p.hour}:${p.minute}`
  return withTime && time !== '00:00' ? `${day} ${time}` : day
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const s = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]
  return s.toUpperCase()
}

const opt = <T>(v: T | null | undefined): T | undefined => (v == null || v === '' ? undefined : v)

// ---------------------------------------------------------------- model output (topic call)

// Lenient on purpose: complete() parses the whole topic answer with this, so a bad card must not fail the topic.
// Every card is checked against CardSchema afterwards and dropped when invalid.
const Nul = <T extends z.ZodType>(t: T) => t.nullable()
const ModelSuggestion = z.object({
  label: z.string().describe('Button-Text, max. 4 Wörter'),
  kind: z.enum(['send', 'remind', 'done', 'save_contact']),
  text: z.string().nullable().describe('send: fertige Nachricht in diesen Chat; remind: Erinnerungstext; sonst null'),
  at: z.string().nullable().describe('nur remind: lokale Zeit ohne Zeitzone, z.B. 2026-10-30T18:00:00'),
})
const ModelData = z.object({
  shopping: Nul(z.object({ items: z.array(z.object({ name: z.string(), who: z.string().nullable().describe(`wer es besorgt; "du" für ${OWNER}`), done: z.boolean() })) })),
  parcel: Nul(z.object({
    steps: z.array(z.string()).describe('z.B. Bestellt, Versandt, In Zustellung, Zugestellt'),
    current: z.number().int().describe('Index des aktuellen Schritts, ab 0'),
    window: z.string().nullable().describe('Zustellfenster, z.B. "14–18 Uhr"'),
  })),
  money: Nul(z.object({ from: z.string().describe(`wer schuldet; "Du" für ${OWNER}`), to: z.string().describe(`wem; "Du" für ${OWNER}`), amount: z.string().describe('z.B. "38,00 €"'), note: z.string().nullable() })),
  trip: Nul(z.object({
    depart: z.string().describe('Abfahrt HH:MM'), arrive: z.string().describe('Ankunft HH:MM'), fromCity: z.string(), toCity: z.string(),
    track: z.string().nullable(), change: z.string().describe('"direkt" oder Umstieg'), duration: z.string().nullable(),
  })),
  place: Nul(z.object({ name: z.string(), detail: z.string().nullable() })),
  address: Nul(z.object({ person: z.string(), lines: z.array(z.string()).describe('Adresszeilen ohne den Namen') })),
  birthday: Nul(z.object({ person: z.string(), age: z.number().int().nullable(), date: z.string().describe('kurz, z.B. "Fr 24.10."'), ideas: z.array(z.string()), note: z.string().nullable() })),
  insight: Nul(z.object({ text: z.string(), sources: z.array(z.string()).describe('z.B. "Projekt Nordlicht · 12. Okt"') })),
}).describe('genau das Feld zum type füllen, alle anderen null')

export const ModelCard = z.object({
  type: z.enum(MODEL_CARD_TYPES),
  subject: z.string().describe('kurzer, gleichbleibender Name der Sache (z.B. "Laufschuhe Zalando"), damit sie beim nächsten Mal wiedererkannt wird'),
  title: z.string().describe('max. 6 Wörter, Deutsch'),
  say: z.string().describe(`1-2 Sätze in Jarvis' Stimme, direkt an ${OWNER} ("du"), konkret mit Namen, Zeiten, Beträgen`),
  context: z.string().nullable().describe('optional ein Satz Zusatzwissen aus anderen Chats oder Notizen, sonst null'),
  urgency: z.number().int().describe('3 = heute/dringend, 2 = bald, 1 = kann warten'),
  due: z.string().nullable().describe('Zeitpunkt der Sache (lokal, ohne Zeitzone) oder null'),
  suggestions: z.array(ModelSuggestion).describe('1-3 vorbereitete nächste Schritte, der beste zuerst'),
  data: ModelData,
})
export type ModelCard = z.infer<typeof ModelCard>

export const CARDS_PROMPT = `
Zusätzlich "cards": Karten für ${OWNER_GEN} Startseite, unabhängig von decision. Nur wenn der Thread es klar hergibt, sonst leeres Array; höchstens 3. Typen:
- shopping: Einkaufsliste aus den Nachrichten (items: name, who = wer es besorgt, "du" für ${OWNER}, done).
- parcel: Paket/Lieferung für ${OWNER} mit Sendungsstand.
- money: Geld, das ${OWNER} jemandem schuldet oder umgekehrt (from schuldet to).
- trip: Zug-/Bus-/Flugreise von ${OWNER} mit Abfahrt und Ankunft.
- place: Treffpunkt/Ort, der ${OWNER} betrifft.
- address: neue oder geteilte Postadresse einer Person.
- birthday: Geburtstag einer Person (ideas = im Chat genannte Geschenkideen).
- insight: wichtiger Zusammenhang, den ${OWNER} sonst übersehen würde (z.B. jemand sucht etwas, das schon geteilt wurde).
Keine Karten für normale Termine, Fragen, Umfragen oder Aufgaben, die entstehen anderswo. Nichts erfinden: Beträge, Zeiten, Adressen nur aus den Daten.
say klingt wie: "Tim hat dir 38 € für die Konzertkarte ausgelegt. Das ist jetzt zweieinhalb Wochen her."
suggestions: send = fertige Nachricht in diesen Chat in ${OWNER_GEN} Ton, remind = Erinnerung (at, text), done = erledigt, save_contact = Adresse speichern (nur bei address).
[Link …], [Nummer], [E-Mail] und [IBAN] sind geschwärzt: nie in Karten übernehmen oder ergänzen.`

export interface CardContext {
  chatJid: string
  chatName: string
  /** time of the underlying conversation (thread end) */
  at: Date
  /** conversation window, used to fix guessed years */
  from: Date
  to: Date
}

export interface CardRow {
  card: OrganizerCard
  chatJid: string | null
  dueAt: Date | null
}

function subjectOf(m: ModelCard): string {
  const d = m.data
  switch (m.type) {
    case 'shopping': return 'list' // one running list per chat
    case 'money': return d.money ? `${d.money.from}-${d.money.to}` : m.subject
    case 'address': return d.address?.person ?? m.subject
    case 'birthday': return d.birthday?.person ?? m.subject
    case 'place': return d.place?.name ?? m.subject
    default: return m.subject
  }
}

function dataOf(m: ModelCard): unknown {
  const d = m.data
  switch (m.type) {
    case 'shopping': return d.shopping && { items: d.shopping.items.map((i) => ({ name: i.name, who: opt(i.who), done: i.done })) }
    case 'parcel': return d.parcel && { steps: d.parcel.steps, current: d.parcel.current, window: opt(d.parcel.window), stats: d.parcel.window ? [{ label: 'Zeitfenster', value: d.parcel.window }] : [] }
    case 'money': return d.money && { from: d.money.from, to: d.money.to, amount: d.money.amount, note: opt(d.money.note) }
    case 'trip': return d.trip && { depart: d.trip.depart, arrive: d.trip.arrive, fromCity: d.trip.fromCity, toCity: d.trip.toCity, track: opt(d.trip.track), change: d.trip.change, duration: opt(d.trip.duration) }
    case 'place': return d.place && { name: d.place.name, detail: opt(d.place.detail) }
    case 'address': return d.address && { lines: [d.address.person, ...d.address.lines] }
    case 'birthday': return d.birthday && { person: { name: d.birthday.person, initials: initials(d.birthday.person) }, age: opt(d.birthday.age), date: d.birthday.date, ideas: d.birthday.ideas, note: opt(d.birthday.note) }
    case 'insight': return d.insight && { text: d.insight.text, sources: d.insight.sources }
  }
}

/** Converts model suggestions into typed actions; drops the ones that cannot be executed. */
function suggestionsOf(m: ModelCard, ctx: CardContext): z.infer<typeof Suggestion>[] {
  const out: z.infer<typeof Suggestion>[] = []
  for (const s of m.suggestions) {
    let action: z.infer<typeof CardAction> | null = null
    if (s.kind === 'send' && s.text?.trim()) action = { kind: 'send', text: s.text.trim() }
    else if (s.kind === 'done') action = { kind: 'done' }
    else if (s.kind === 'remind') {
      const at = sanitizeYear(parseDate(s.at), ctx.from, ctx.to)
      if (at) action = { kind: 'remind', at: at.toISOString(), text: s.text?.trim() || m.title }
    } else if (s.kind === 'save_contact' && m.data.address) {
      action = { kind: 'save_contact', name: m.data.address.person, lines: m.data.address.lines }
    }
    if (action && s.label.trim()) out.push({ id: String.fromCharCode(97 + out.length), label: s.label.trim(), action })
    if (out.length === 3) break
  }
  if (!out.length) out.push({ id: 'done', label: 'Erledigt', action: { kind: 'done' } })
  out[0].primary = true
  return out
}

/** Builds a contract card from one model card, or returns an error message when it is not valid. */
export function fromModel(m: ModelCard, ctx: CardContext): { row: CardRow } | { error: string } {
  const personScoped = m.type === 'birthday' || m.type === 'address'
  const due = sanitizeYear(parseDate(m.due), ctx.from, ctx.to)
  const candidate = {
    key: cardKey(m.type, personScoped ? null : ctx.chatJid, subjectOf(m)),
    type: m.type,
    group: CARD_GROUP[m.type],
    urgency: Math.min(3, Math.max(1, Math.round(m.urgency || 1))),
    state: 'new',
    title: m.title,
    source: { chat: ctx.chatName, chatJid: ctx.chatJid, when: whenLabel(due ?? ctx.at), at: ctx.at.toISOString() },
    say: m.say,
    context: opt(m.context?.trim()),
    suggestions: suggestionsOf(m, ctx),
    data: dataOf(m),
  }
  return validate(candidate, due, ctx.chatJid)
}

export function validate(candidate: unknown, dueAt: Date | null, chatJid: string | null): { row: CardRow } | { error: string } {
  const r = CardSchema.safeParse(candidate)
  if (!r.success) return { error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  return { row: { card: r.data, chatJid, dueAt } }
}

// ---------------------------------------------------------------- storage

/**
 * Idempotent upsert by key. Never touches cards the owner marked done or dismissed (or the API expired),
 * and never writes cards for excluded chats.
 */
export const UPSERT_SQL = `
INSERT INTO cards (type, key, payload, due_at, chat_jid)
SELECT $1, $2, $3::jsonb, $4::timestamptz, $5
WHERE $5::text IS NULL OR NOT EXISTS (SELECT 1 FROM organizer_exclusions e WHERE e.chat_jid = $5::text)
ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, due_at = excluded.due_at, chat_jid = excluded.chat_jid, updated_at = now()
WHERE cards.status = 'open' AND cards.payload IS DISTINCT FROM excluded.payload`

/** Returns the number of inserted or changed cards. */
export async function upsertCards(db: Queryable, rows: CardRow[]): Promise<number> {
  let n = 0
  for (const r of rows) {
    const res = await db.query(UPSERT_SQL, [r.card.type, r.card.key, JSON.stringify(r.card), r.dueAt?.toISOString() ?? null, r.chatJid])
    n += res.rowCount ?? 0
  }
  return n
}

/** Validates and stores the cards of one topic answer; invalid cards are logged and dropped. */
export async function storeModelCards(db: Queryable, cards: ModelCard[], ctx: CardContext): Promise<number> {
  const rows: CardRow[] = []
  for (const m of cards.slice(0, 3)) {
    const r = fromModel(m, ctx)
    if ('error' in r) log(`Card dropped (${m.type} "${m.title}"): ${r.error}`)
    else rows.push(r.row)
  }
  return rows.length ? upsertCards(db, rows) : 0
}
