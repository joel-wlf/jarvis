import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { likeEscape, pool } from './db.js'

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) })

const EMOJI = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu

interface Own {
  body: string
  ts: Date
}

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0)
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '-')

/** Zahlen zum Schreibstil aus einer Liste eigener Nachrichten. */
export function styleStats(msgs: Own[]): string[] {
  const n = msgs.length
  if (!n) return []
  const lens = msgs.map((m) => m.body.length)
  const words = msgs.map((m) => m.body.split(/\s+/).filter(Boolean).length)
  const emojiMsgs = msgs.filter((m) => EMOJI.test(m.body)).length
  EMOJI.lastIndex = 0
  const emojiCount = new Map<string, number>()
  for (const m of msgs) for (const e of m.body.match(EMOJI) ?? []) emojiCount.set(e, (emojiCount.get(e) ?? 0) + 1)
  const lowerStart = msgs.filter((m) => /^\p{Ll}/u.test(m.body)).length
  const endsPeriod = msgs.filter((m) => /[.]$/.test(m.body)).length
  const excl = msgs.filter((m) => m.body.includes('!')).length
  const quest = msgs.filter((m) => m.body.includes('?')).length
  const noPunct = msgs.filter((m) => !/[.!?…)]$/u.test(m.body) && !EMOJI.test(m.body.slice(-4))).length
  EMOJI.lastIndex = 0
  const openers = new Map<string, number>()
  for (const m of msgs) {
    const w = m.body.split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, '')
    if (w && w.length <= 10) openers.set(w, (openers.get(w) ?? 0) + 1)
  }
  const top = (mp: Map<string, number>, k: number, min = 2) =>
    [...mp].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, k).map(([w, c]) => `${w} (${c}x)`).join(', ')
  const out = [
    `Länge: typisch ${median(lens)} Zeichen, ${median(words)} Wörter (kurz = unter 40 Zeichen: ${pct(lens.filter((l) => l < 40).length, n)})`,
    `Emojis: in ${pct(emojiMsgs, n)} der Nachrichten${top(emojiCount, 5, 1) ? `; häufig: ${top(emojiCount, 5, 1)}` : ''}`,
    `Satzanfang klein: ${pct(lowerStart, n)}; endet mit Punkt: ${pct(endsPeriod, n)}; ohne Satzzeichen am Ende: ${pct(noPunct, n)}`,
    `Ausrufezeichen: ${pct(excl, n)}; Fragen: ${pct(quest, n)}`,
  ]
  const op = top(openers, 5)
  if (op) out.push(`Typische erste Wörter: ${op}`)
  return out
}

async function ownMessages(chatJid: string, limit: number): Promise<Own[]> {
  const r = await pool.query<{ body: string; ts: Date }>(
    `SELECT body, ts FROM v_messages
     WHERE chat_jid = $1 AND from_me AND type = 'text' AND deleted_at IS NULL
       AND length(body) BETWEEN 2 AND 400 AND body !~* '^https?://' AND body NOT LIKE '%http%'
     ORDER BY ts DESC LIMIT $2`,
    [chatJid, limit],
  )
  return r.rows
}

const quote = (m: Own) => `  - "${m.body.replace(/\s+/g, ' ')}"`

/** Beispiele: kurze und längere gemischt, neueste zuerst, ohne Duplikate. */
function pickExamples(msgs: Own[], k: number): Own[] {
  const seen = new Set<string>()
  const out: Own[] = []
  for (const m of msgs) {
    const key = m.body.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
    if (out.length >= k) break
  }
  return out
}

export function registerStyleTools(server: McpServer) {
  server.registerTool(
    'get_writing_style',
    {
      description:
        'Joels Schreibstil gegenüber einer Person oder in einem Chat: Zahlen (Länge, Emojis, Groß-/Kleinschreibung, Satzzeichen), echte Beispiel-Nachrichten von ihm und das Verhältnis (Beziehung, Anrede). ' +
        'IMMER vor dem Entwerfen oder Senden einer Nachricht aufrufen und im Stil von Joel schreiben (Länge, Ton, Emojis, Anrede wie in den Beispielen), nicht im Stil eines Assistenten. ' +
        'Bei wenigen eigenen Nachrichten kommen Beispiele aus Chats mit ähnlichen Personen dazu.',
      inputSchema: {
        chat: z.string().describe('Person oder Chat (Name-Teilstring oder JID)'),
      },
    },
    async ({ chat }) => {
      const like = `%${likeEscape(chat)}%`
      const c = await pool.query<{ jid: string; name: string; is_group: boolean; message_count: number }>(
        `SELECT jid, name, is_group, message_count FROM v_chats WHERE jid = $1 OR name ILIKE $2
         ORDER BY (lower(name) = lower($1)) DESC, message_count DESC LIMIT 4`,
        [chat, like],
      )
      if (!c.rows.length) return text(`Kein Chat zu "${chat}" gefunden.`, true)
      const target = c.rows[0]
      const lines: string[] = [`Schreibstil von Joel in: ${target.name}${target.is_group ? ' (Gruppe)' : ''}`]
      if (c.rows.length > 1 && c.rows[1].name.toLowerCase().includes(chat.toLowerCase()))
        lines.push(`(Weitere Treffer: ${c.rows.slice(1).map((x) => x.name).join(', ')}. Falls der falsche gemeint ist, genauer angeben.)`)

      const prof = await pool
        .query<{ relationship: string | null; closeness: number | null; formality: string | null; tone: string | null; note: string | null }>(
          `SELECT relationship, closeness, formality, tone, note FROM contact_profiles WHERE jid = $1`,
          [target.jid],
        )
        .catch(() => ({ rows: [] as never[] }))
      const p = prof.rows[0]
      if (p) lines.push(`Verhältnis: ${p.relationship ?? '?'}${p.closeness ? `, Nähe ${p.closeness}/5` : ''}${p.formality ? `, Anrede/Formalität: ${p.formality}` : ''}${p.tone ? `, Ton: ${p.tone}` : ''}${p.note ? `. Hinweis: ${p.note}` : ''}`)

      const own = await ownMessages(target.jid, 300)
      if (own.length) {
        lines.push(`\nZahlen (aus ${own.length} eigenen Nachrichten hier):`)
        for (const s of styleStats(own)) lines.push(`- ${s}`)
        lines.push('\nBeispiele (neueste zuerst):')
        for (const m of pickExamples(own, 10)) lines.push(quote(m))
      } else {
        lines.push('\nJoel hat hier noch keine Textnachrichten geschrieben.')
      }

      if (own.length < 25) {
        const sim = await pool.query<{ jid: string; name: string }>(
          `SELECT p.jid, coalesce(c.name, p.real_name, p.jid) AS name
           FROM contact_profiles p JOIN v_chats c ON c.jid = p.jid AND NOT c.is_group
           WHERE p.jid <> $1 AND p.relationship IS NOT DISTINCT FROM $2 AND ($3::int IS NULL OR abs(coalesce(p.closeness, $3) - $3) <= 1)
           ORDER BY c.message_count DESC LIMIT 6`,
          [target.jid, p?.relationship ?? null, p?.closeness ?? null],
        )
        if (sim.rows.length) {
          const pool2: Own[] = []
          for (const s of sim.rows) pool2.push(...(await ownMessages(s.jid, 60)).slice(0, 12))
          pool2.sort((a, b) => b.ts.getTime() - a.ts.getTime())
          if (pool2.length) {
            lines.push(`\nZahlen bei ähnlichen Personen (${sim.rows.map((x) => x.name).join(', ')}):`)
            for (const s of styleStats(pool2)) lines.push(`- ${s}`)
            lines.push('Beispiele dort:')
            for (const m of pickExamples(pool2, 8)) lines.push(quote(m))
          }
        }
      }

      const theirs = await pool.query<{ body: string }>(
        `SELECT body FROM v_messages WHERE chat_jid = $1 AND NOT from_me AND type = 'text' AND deleted_at IS NULL AND length(body) BETWEEN 2 AND 400
         ORDER BY ts DESC LIMIT 60`,
        [target.jid],
      )
      if (theirs.rows.length >= 5) lines.push(`\nZum Vergleich: ${target.is_group ? 'Andere' : 'Die Person'} schreibt typisch ${median(theirs.rows.map((x) => x.body.length))} Zeichen pro Nachricht.`)

      lines.push('\nSo verwenden: Länge, Anrede, Emojis und Satzzeichen an den Beispielen ausrichten. Nichts Förmlicheres oder Längeres schreiben als Joel hier üblicherweise. Keine Floskeln und keine Gedankenstriche, die er nie nutzt.')
      return text(lines.join('\n'))
    },
  )
}
