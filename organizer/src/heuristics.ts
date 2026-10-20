import { createHash } from 'node:crypto'
import { CARD_GROUP, cardKey, upsertCards, validate, whenLabel, type CardRow } from './cards.js'
import { log, type Queryable } from './lib.js'

// Rule-based cards without a model call: followup (own promises without a later own message), link (shared URLs)
// and photos (image messages per chat and day). Excluded chats are skipped in every query.

const FOLLOWUP_MIN_HOURS = Number(process.env.CARDS_FOLLOWUP_MIN_HOURS || 20) // give yourself time to keep the promise
const FOLLOWUP_MAX_DAYS = Number(process.env.CARDS_FOLLOWUP_MAX_DAYS || 14)
const LINK_DAYS = Number(process.env.CARDS_LINK_DAYS || 3)
const PHOTOS_DAYS = Number(process.env.CARDS_PHOTOS_DAYS || 3)
const PHOTOS_MIN = Number(process.env.CARDS_PHOTOS_MIN || 3)

const NOT_EXCLUDED = `NOT EXISTS (SELECT 1 FROM organizer_exclusions e WHERE e.chat_jid = m.chat_jid)`
const CHAT_NAME = `coalesce(c.name, ct.name, ct.push_name, m.chat_jid)`
const CHAT_JOIN = `LEFT JOIN chats c ON c.jid = m.chat_jid LEFT JOIN contacts ct ON ct.jid = m.chat_jid`

/** Own messages that promise a reply or a delivery ("ich melde mich", "schick ich dir"). */
export const PROMISE_RE =
  /\b(?:ich\s+meld(?:e)?\s+mich|meld(?:e)?\s+mich\s+(?:morgen|nachher|später|gleich|heute|bald|die\s+tage|nochmal|wieder|bei\s+dir|bei\s+euch)|(?:ich\s+)?schick(?:e)?\s+(?:ich\s+)?(?:dir|euch|ihnen)|ich\s+(?:sag|gebe?)\s+(?:dir|euch)\s+(?:noch\s+)?bescheid|sag\s+(?:dir|euch)\s+(?:noch\s+)?bescheid|ich\s+(?:ruf|rufe)\s+(?:dich|euch)\s+(?:\w+\s+)?an|ich\s+schau(?:e)?\s+(?:mal\s+)?nach\s+und|ich\s+schreib(?:e)?\s+(?:dir|euch)\s+(?:\w+\s+)?(?:morgen|nachher|später|gleich|noch))/i

const days = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000))
const sinceLabel = (d: number) => (d === 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`)
const quote = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function keep(rows: CardRow[], candidate: unknown, dueAt: Date | null, chatJid: string) {
  const r = validate(candidate, dueAt, chatJid)
  if ('error' in r) log(`Card dropped (rule): ${r.error}`)
  else rows.push(r.row)
}

// ---------------------------------------------------------------- followup

export async function followupCards(db: Queryable, now = new Date()): Promise<CardRow[]> {
  const r = await db.query(
    `SELECT x.* FROM (
       SELECT DISTINCT ON (m.chat_jid) m.chat_jid, m.id, m.ts, m.body, ${CHAT_NAME} AS chat_name, coalesce(c.is_group, false) AS is_group
       FROM messages m ${CHAT_JOIN}
       WHERE m.from_me AND m.type <> 'reaction' AND m.deleted_at IS NULL AND m.ts > $1::timestamptz - make_interval(days => $3::int) AND ${NOT_EXCLUDED}
       ORDER BY m.chat_jid, m.ts DESC) x
     WHERE x.body IS NOT NULL AND x.ts < $1::timestamptz - make_interval(hours => $2::int)`,
    [now.toISOString(), FOLLOWUP_MIN_HOURS, FOLLOWUP_MAX_DAYS],
  )
  const rows: CardRow[] = []
  for (const m of r.rows as { chat_jid: string; id: string; ts: Date; body: string; chat_name: string; is_group: boolean }[]) {
    if (!PROMISE_RE.test(m.body)) continue
    const ts = new Date(m.ts)
    const d = days(ts, now)
    const theirs = await db.query(
      `SELECT count(*)::int AS n FROM messages WHERE chat_jid = $1 AND NOT from_me AND type <> 'reaction' AND deleted_at IS NULL AND ts > $2::timestamptz`,
      [m.chat_jid, ts.toISOString()],
    )
    const answered = Number(theirs.rows[0]?.n ?? 0)
    const who = m.is_group ? `in ${m.chat_name}` : m.chat_name
    keep(rows, {
      key: cardKey('followup', m.chat_jid, m.id),
      type: 'followup',
      group: CARD_GROUP.followup,
      urgency: d >= 3 ? 2 : 1,
      state: 'new',
      title: m.is_group ? `Offenes Versprechen in ${m.chat_name}` : `Du wolltest ${m.chat_name} zurückschreiben`,
      source: { chat: m.chat_name, chatJid: m.chat_jid, when: sinceLabel(d), at: ts.toISOString() },
      say: `Du hast ${sinceLabel(d)} ${who} geschrieben: „${quote(m.body, 120)}“ Seitdem kam von dir nichts mehr.`,
      suggestions: [
        { id: 'a', label: 'Jetzt melden', action: { kind: 'send', text: 'Sorry, dass ich mich erst jetzt melde!' }, primary: true },
        { id: 'done', label: 'Erledigt', action: { kind: 'done' } },
      ],
      data: {
        days: d,
        promise: quote(m.body, 300),
        promisedAt: `Du, ${whenLabel(ts)}`,
        note: answered ? `Seitdem ${answered === 1 ? 'eine Nachricht' : `${answered} Nachrichten`} von der anderen Seite` : `${m.is_group ? 'Im Chat' : m.chat_name} hat seitdem nichts mehr geschrieben`,
      },
    }, null, m.chat_jid)
  }
  return rows
}

/** A later own message in the chat keeps the promise: close open followup cards automatically. */
export async function closeKeptPromises(db: Queryable): Promise<number> {
  const r = await db.query(
    `UPDATE cards k SET status = 'done', updated_at = now()
     WHERE k.type = 'followup' AND k.status = 'open' AND EXISTS (
       SELECT 1 FROM messages m WHERE m.chat_jid = k.chat_jid AND m.from_me AND m.type <> 'reaction' AND m.deleted_at IS NULL
         AND m.ts > (k.payload->'source'->>'at')::timestamptz)`,
  )
  return r.rowCount ?? 0
}

// ---------------------------------------------------------------- link

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi
/** Links that are not reading material (invites, maps, calls). */
const SKIP_HOSTS = /(^|\.)(chat\.whatsapp\.com|wa\.me|maps\.app\.goo\.gl|maps\.google\.[a-z.]+|goo\.gl|meet\.google\.com|zoom\.us|teams\.microsoft\.com)$/i

export function extractUrls(body: string): URL[] {
  const out: URL[] = []
  for (const raw of body.match(URL_RE) ?? []) {
    try {
      const u = new URL(raw.replace(/[.,;:!?)\]}]+$/, ''))
      if (!SKIP_HOSTS.test(u.hostname)) out.push(u)
    } catch {
      // not a URL
    }
  }
  return out
}

/** Best available headline: a stored page title, the text around the URL, a readable path segment, or the domain. */
export function headlineOf(u: URL, body: string, storedTitle?: string | null): string {
  if (storedTitle?.trim()) return quote(storedTitle, 100)
  const around = body.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim()
  if (/\p{L}{3}/u.test(around) && around.length >= 8) return quote(around, 100)
  const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-_+]+/g, ' ')
    .trim()
  if (/^[\p{L} ]{8,}$/u.test(seg) && seg.includes(' ')) return quote(seg.charAt(0).toUpperCase() + seg.slice(1), 100)
  return u.hostname.replace(/^www\./, '')
}

export async function linkCards(db: Queryable, now = new Date()): Promise<CardRow[]> {
  const r = await db.query(
    `SELECT m.chat_jid, m.id, m.ts, m.body, m.media_meta->>'title' AS title, ${CHAT_NAME} AS chat_name,
            coalesce(sc.name, sc.push_name, 'Jemand') AS sender
     FROM messages m ${CHAT_JOIN} LEFT JOIN contacts sc ON sc.jid = m.sender_jid
     WHERE NOT m.from_me AND m.type = 'text' AND m.deleted_at IS NULL AND m.body ~* 'https?://'
       AND m.ts > $1::timestamptz - make_interval(days => $2::int) AND ${NOT_EXCLUDED}
     ORDER BY m.ts DESC LIMIT 40`,
    [now.toISOString(), LINK_DAYS],
  )
  const rows: CardRow[] = []
  const seen = new Set<string>()
  for (const m of r.rows as { chat_jid: string; id: string; ts: Date; body: string; title: string | null; chat_name: string; sender: string }[]) {
    const ts = new Date(m.ts)
    for (const u of extractUrls(m.body).slice(0, 1)) {
      const url = u.toString()
      const key = cardKey('link', m.chat_jid, createHash('sha256').update(url).digest('hex').slice(0, 12))
      if (seen.has(key)) continue
      seen.add(key)
      const domain = u.hostname.replace(/^www\./, '')
      const headline = headlineOf(u, m.body, m.title)
      keep(rows, {
        key,
        type: 'link',
        group: CARD_GROUP.link,
        urgency: 1,
        state: 'new',
        title: `${m.sender} teilt einen Link`,
        source: { chat: m.chat_name, chatJid: m.chat_jid, when: whenLabel(ts), at: ts.toISOString() },
        say: headline === domain
          ? `${m.sender} hat in ${m.chat_name} einen Link von ${domain} geteilt.`
          : `${m.sender} hat in ${m.chat_name} einen Link von ${domain} geteilt: ${headline}.`.replace(/([.!?…])\.$/, '$1'),
        suggestions: [
          { id: 'open', label: 'Öffnen', action: { kind: 'open', url }, primary: true },
          { id: 'later', label: 'Morgen erinnern', action: { kind: 'remind', at: new Date(now.getTime() + 86_400_000).toISOString(), text: `Link lesen: ${headline}` } },
        ],
        data: { url, domain, headline },
      }, null, m.chat_jid)
    }
  }
  return rows
}

// ---------------------------------------------------------------- photos

export async function photoCards(db: Queryable, now = new Date()): Promise<CardRow[]> {
  const r = await db.query(
    `SELECT m.chat_jid, to_char(m.ts AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') AS day, count(*)::int AS n, max(m.ts) AS last,
            count(DISTINCT m.sender_jid)::int AS senders, mode() WITHIN GROUP (ORDER BY coalesce(sc.name, sc.push_name, 'Jemand')) AS sender,
            min(${CHAT_NAME}) AS chat_name
     FROM messages m ${CHAT_JOIN} LEFT JOIN contacts sc ON sc.jid = m.sender_jid
     WHERE m.type = 'image' AND NOT m.from_me AND m.deleted_at IS NULL
       AND m.ts > $1::timestamptz - make_interval(days => $2::int) AND ${NOT_EXCLUDED}
     GROUP BY m.chat_jid, 2 HAVING count(*) >= $3::int`,
    [now.toISOString(), PHOTOS_DAYS, PHOTOS_MIN],
  )
  const rows: CardRow[] = []
  for (const g of r.rows as { chat_jid: string; day: string; n: number; last: Date; senders: number; sender: string; chat_name: string }[]) {
    const last = new Date(g.last)
    const by = g.senders === 1 ? g.sender : `${g.sender} und andere`
    keep(rows, {
      key: cardKey('photos', g.chat_jid, g.day),
      type: 'photos',
      group: CARD_GROUP.photos,
      urgency: 1,
      state: 'new',
      title: g.senders === 1 ? `${g.sender} hat ${g.n} Fotos geteilt` : `${g.n} neue Fotos in ${g.chat_name}`,
      source: { chat: g.chat_name, chatJid: g.chat_jid, when: whenLabel(last, false), at: last.toISOString() },
      say: `${by} ${g.senders === 1 ? 'hat' : 'haben'} in ${g.chat_name} ${g.n} Fotos geteilt.`,
      suggestions: [{ id: 'done', label: 'Gesehen', action: { kind: 'done' }, primary: true }],
      data: { count: g.n, withOwner: 0, thumbnails: [] },
    }, null, g.chat_jid)
  }
  return rows
}

/** Runs all rules and stores their cards. Cheap (SQL only), meant to run every few minutes. */
export async function runCardRules(db: Queryable, now = new Date()): Promise<void> {
  const closed = await closeKeptPromises(db)
  const rows = [...(await followupCards(db, now)), ...(await linkCards(db, now)), ...(await photoCards(db, now))]
  const changed = rows.length ? await upsertCards(db, rows) : 0
  if (changed || closed) log(`Cards (rules): ${changed} new or updated, ${closed} promises kept`)
}

