import pg from 'pg'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** z.B. "Mo., 19.10.2026, 18:03" (Europe/Berlin) */
export function fmtTs(d: Date): string {
  return dateFmt.format(d)
}

export function nowBerlin(): string {
  return fmtTs(new Date())
}

export interface MsgRow {
  id: string
  chat_jid: string
  chat_name: string
  sender_name: string
  ts: Date
  type: string
  body: string | null
  edited_at?: Date | null
  deleted_at?: Date | null
}

export function formatMessages(rows: MsgRow[], opts: { max?: number; dedupe?: boolean; reactions?: Map<string, string> } = {}): string {
  if (rows.length === 0) return 'Keine Nachrichten gefunden.'
  const max = opts.max ?? 600 // lange Nachrichten (Listen, Texte, Weiterleitungen) kürzen, Volltext über get_conversation_context
  const seen = new Set<string>()
  let skipped = 0
  const lines: string[] = []
  for (const r of rows) {
    const body = r.body?.trim()
    const full = r.type === 'audio' ? (body ? `🎤 (Sprachnachricht, transkribiert) ${body}` : '[Sprachnachricht, nicht transkribiert]') : body || `[${r.type}]`
    if (opts.dedupe !== false && full.length > 100) {
      const key = full.slice(0, 200)
      if (seen.has(key)) {
        skipped++
        continue
      }
      seen.add(key)
    }
    const shown = full.length > max ? `${full.slice(0, max)}… [gekürzt, ${full.length} Zeichen]` : full
    const flags = `${r.deleted_at ? ' (gelöscht)' : ''}${r.edited_at ? ' (bearbeitet)' : ''}`
    const rx = opts.reactions?.get(`${r.chat_jid}\u0000${r.id}`)
    lines.push(`[${fmtTs(r.ts)}] ${r.chat_name} | ${r.sender_name}: ${shown}${flags}\n  ref=${r.chat_jid}:${r.id}${rx ? `\n  ${rx}` : ''}`)
  }
  if (skipped) lines.push(`(${skipped} weitere Nachricht(en) mit gleichem Anfang ausgelassen, vermutlich weitergeleitet oder wiederholt)`)
  return lines.join('\n')
}

/** Escaped %, _ und \ für ILIKE. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const EMBED_URL = process.env.EMBED_URL ?? 'http://embedder:3001'

/** Vektor für eine Suchanfrage vom Embedder-Dienst holen. */
export async function embedQuery(q: string): Promise<number[]> {
  const res = await fetch(`${EMBED_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [q], type: 'query' }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`embedder HTTP ${res.status}`)
  return ((await res.json()) as { vectors: number[][] }).vectors[0]
}

export interface ContactHit {
  jid: string
  name: string
  real_name: string | null
  phone: string | null
}

/** Kontakte per gespeichertem Namen, Anzeigenamen, echtem Namen oder Spitznamen finden (auch wenn der Kontakt anders gespeichert ist). */
export async function findContacts(input: string, limit = 8): Promise<ContactHit[]> {
  const like = `%${likeEscape(input)}%`
  const r = await pool.query<ContactHit>(
    `SELECT c.jid, coalesce(c.name, c.push_name, c.jid) AS name, p.real_name, c.phone
     FROM contacts c LEFT JOIN contact_profiles p ON p.jid = c.jid
     WHERE NOT c.is_group AND (c.name ILIKE $1 OR c.push_name ILIKE $1 OR p.real_name ILIKE $1 OR array_to_string(p.aliases, ' ') ILIKE $1 OR c.phone LIKE $1)
     ORDER BY (lower(coalesce(c.name, c.push_name, '')) = lower($2) OR lower(coalesce(p.real_name, '')) = lower($2)) DESC, c.name NULLS LAST LIMIT $3`,
    [like, input, limit],
  ).catch(() => ({ rows: [] as ContactHit[] }))
  return r.rows
}

/**
 * Ähnlich geschriebene oder klingende Namen (Tippfehler, Spracheingabe: "Stefan" statt "Stephan").
 * Trigramm-Ähnlichkeit auf dem ganzen Namen und Lautvergleich (Double Metaphone) auf den einzelnen Wörtern.
 */
export async function similarNames(input: string, limit = 5): Promise<string[]> {
  const w = input.trim().toLowerCase()
  if (w.length < 3) return []
  try {
    const r = await pool.query<{ name: string }>(
      `SELECT name FROM (
         SELECT DISTINCT n AS name,
                greatest(similarity(lower(n), $1), word_similarity($1, lower(n)),
                         (SELECT coalesce(max(CASE WHEN dmetaphone(x) <> '' AND levenshtein(dmetaphone(x), dmetaphone($1)) <= 1 AND length($1) >= 4 THEN 0.6 ELSE 0 END), 0)
                          FROM unnest(string_to_array(lower(n), ' ')) x)) AS score
         FROM (SELECT name AS n FROM contacts WHERE name IS NOT NULL AND NOT is_group
               UNION SELECT push_name FROM contacts WHERE push_name IS NOT NULL AND NOT is_group
               UNION SELECT real_name FROM contact_profiles WHERE real_name IS NOT NULL
               UNION SELECT name FROM chats WHERE name IS NOT NULL) s
       ) t WHERE score >= 0.3 ORDER BY score DESC, name LIMIT $2`,
      [w, limit],
    )
    return r.rows.map((x) => x.name)
  } catch {
    return [] // Erweiterung fuzzystrmatch/pg_trgm nicht vorhanden
  }
}

/** Reaktionen (Emojis) zu den angezeigten Nachrichten: "👍 Ich, Lisa; ❤️ Anna". */
export async function loadReactions(rows: MsgRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!rows.length) return out
  const r = await pool
    .query<{ chat_jid: string; message_id: string; emoji: string; who: string }>(
      `SELECT mr.chat_jid, mr.message_id, mr.emoji,
              CASE WHEN mr.from_me THEN 'Ich' ELSE coalesce(c.name, c.push_name, mr.reactor_jid) END AS who
       FROM message_reactions mr LEFT JOIN contacts c ON c.jid = mr.reactor_jid
       JOIN unnest($1::text[], $2::text[]) AS t(c, i) ON mr.chat_jid = t.c AND mr.message_id = t.i
       ORDER BY mr.ts`,
      [rows.map((x) => x.chat_jid), rows.map((x) => x.id)],
    )
    .catch(() => ({ rows: [] as { chat_jid: string; message_id: string; emoji: string; who: string }[] }))
  const byKey = new Map<string, Map<string, string[]>>()
  for (const x of r.rows) {
    const k = `${x.chat_jid}\u0000${x.message_id}`
    const m = byKey.get(k) ?? new Map<string, string[]>()
    m.set(x.emoji, [...(m.get(x.emoji) ?? []), x.who])
    byKey.set(k, m)
  }
  for (const [k, m] of byKey) out.set(k, [...m].map(([e, who]) => `${e} ${who.join(', ')}`).join('; '))
  return out
}

export interface PollResult {
  question: string
  options: { name: string; voters: string[] }[]
  voted: number
}

/** Stimmen je Option mit Namen der Abstimmenden; Schlüssel wie bei den Reaktionen. */
export async function loadPollResults(rows: Pick<MsgRow, 'chat_jid' | 'id' | 'type'>[]): Promise<Map<string, PollResult>> {
  const out = new Map<string, PollResult>()
  const polls = rows.filter((x) => x.type === 'poll')
  if (!polls.length) return out
  const ids = [polls.map((x) => x.chat_jid), polls.map((x) => x.id)]
  try {
    const defs = await pool.query<{ chat_jid: string; id: string; pc: { name?: string; options?: { optionName?: string }[] } | null }>(
      `SELECT m.chat_jid, m.id,
              coalesce(m.raw->'message'->'pollCreationMessageV3', m.raw->'message'->'pollCreationMessageV2', m.raw->'message'->'pollCreationMessage') AS pc
       FROM messages m JOIN unnest($1::text[], $2::text[]) AS t(c, i) ON m.chat_jid = t.c AND m.id = t.i`,
      ids,
    )
    const votes = await pool.query<{ chat_jid: string; poll_msg_id: string; options: string[]; who: string }>(
      `SELECT pv.chat_jid, pv.poll_msg_id, pv.options,
              CASE WHEN pv.voter_jid IN (SELECT value FROM meta WHERE key IN ('self_jid','self_lid')) THEN 'Ich'
                   ELSE coalesce(c.name, c.push_name, c2.name, c2.push_name, pv.voter_jid) END AS who
       FROM poll_votes pv
       JOIN unnest($1::text[], $2::text[]) AS t(c, i) ON pv.chat_jid = t.c AND pv.poll_msg_id = t.i
       LEFT JOIN contacts c ON c.jid = pv.voter_jid
       LEFT JOIN group_participants gp ON gp.lid = pv.voter_jid AND gp.chat_jid = pv.chat_jid
       LEFT JOIN contacts c2 ON c2.jid = gp.jid
       ORDER BY pv.ts`,
      ids,
    )
    for (const d of defs.rows) {
      const names = (d.pc?.options ?? []).map((o) => o.optionName ?? '').filter(Boolean)
      const opts = names.map((name) => ({ name, voters: [] as string[] }))
      let voted = 0
      for (const v of votes.rows) {
        if (v.chat_jid !== d.chat_jid || v.poll_msg_id !== d.id) continue
        voted++
        for (const o of v.options) opts.find((x) => x.name === o)?.voters.push(v.who)
      }
      out.set(`${d.chat_jid}\u0000${d.id}`, { question: d.pc?.name ?? '', options: opts, voted })
    }
  } catch {
    /* Umfrage-Details sind optional */
  }
  return out
}

function pollLine(p: PollResult): string {
  if (!p.voted) return 'Stimmen: noch keine erfasst'
  return `Stimmen (${p.voted}): ${p.options.map((o) => `${o.name} [${o.voters.length}]${o.voters.length ? ` ${o.voters.join(', ')}` : ''}`).join(' | ')}`
}

/** formatMessages inklusive Reaktionen und Umfrage-Ergebnissen. */
export async function fmt(rows: MsgRow[], opts: { max?: number; dedupe?: boolean } = {}): Promise<string> {
  const [reactions, polls] = await Promise.all([loadReactions(rows), loadPollResults(rows)])
  const extra = new Map<string, string>()
  for (const [k, v] of reactions) extra.set(k, `Reaktionen: ${v}`)
  for (const [k, p] of polls) extra.set(k, [extra.get(k), pollLine(p)].filter(Boolean).join('\n  '))
  return formatMessages(rows, { ...opts, reactions: extra })
}
