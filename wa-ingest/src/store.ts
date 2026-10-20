import pg from 'pg'
import {
  BufferJSON,
  decryptPollVote,
  jidNormalizedUser,
  sha256,
  normalizeMessageContent,
  proto,
  type Chat,
  type Contact,
  type GroupMetadata,
  type WAMessage,
  type WAMessageContent,
} from '@whiskeysockets/baileys'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

const CHUNK = 200
const IGNORED_CHATS = (jid: string) =>
  jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')

let selfIds: string[] = []

export async function setSelf(ids: Array<string | undefined>) {
  selfIds = ids.filter((x): x is string => !!x).map(jidNormalizedUser)
  if (selfIds[0]) {
    await pool.query(
      `INSERT INTO meta (key, value) VALUES ('self_jid', $1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [selfIds[0]],
    )
  }
  if (selfIds[1]) {
    await pool.query(
      `INSERT INTO meta (key, value) VALUES ('self_lid', $1)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [selfIds[1]],
    )
  }
}

const selfJid = () => selfIds[0] ?? 'self'

function toNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'toNumber' in (v as object)) return (v as { toNumber(): number }).toNumber()
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function phoneOf(jid: string): string | null {
  return jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].split(':')[0] : null
}

async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK))
}

/** Baut "($1,$2),($3,$4)" für Multi-Row-Inserts. */
function placeholders(rows: number, cols: number): string {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    const p: string[] = []
    for (let c = 0; c < cols; c++) p.push(`$${r * cols + c + 1}`)
    out.push(`(${p.join(',')})`)
  }
  return out.join(',')
}

export async function upsertContacts(contacts: Partial<Contact>[]) {
  const rows = contacts.filter((c) => c.id && !IGNORED_CHATS(c.id))
  await inChunks(rows, async (chunk) => {
    const params: unknown[] = []
    for (const c of chunk) {
      params.push(c.id, c.name ?? null, c.notify ?? c.verifiedName ?? null, phoneOf(c.id!), c.id!.endsWith('@g.us'))
    }
    await pool.query(
      `INSERT INTO contacts (jid, name, push_name, phone, is_group) VALUES ${placeholders(chunk.length, 5)}
       ON CONFLICT (jid) DO UPDATE SET
         name = coalesce(excluded.name, contacts.name),
         push_name = coalesce(excluded.push_name, contacts.push_name),
         updated_at = now()`,
      params,
    )
  })
}

export async function upsertChats(chats: Partial<Chat>[]) {
  const rows = chats.filter((c) => c.id && !IGNORED_CHATS(c.id))
  await inChunks(rows, async (chunk) => {
    const params: unknown[] = []
    for (const c of chunk) {
      const t = toNumber(c.conversationTimestamp)
      params.push(
        c.id,
        c.name ?? null,
        c.id!.endsWith('@g.us'),
        t ? new Date(t * 1000) : null,
        c.unreadCount ?? null,
        c.archived ?? null,
      )
    }
    await pool.query(
      `INSERT INTO chats (jid, name, is_group, last_message_at, unread, archived) VALUES ${placeholders(chunk.length, 6)}
       ON CONFLICT (jid) DO UPDATE SET
         name = coalesce(excluded.name, chats.name),
         last_message_at = greatest(excluded.last_message_at, chats.last_message_at),
         unread = coalesce(excluded.unread, chats.unread),
         archived = coalesce(excluded.archived, chats.archived),
         updated_at = now()`,
      params,
    )
  })
}

export async function upsertGroups(groups: Partial<GroupMetadata>[]) {
  for (const g of groups) {
    if (!g.id) continue
    await pool.query(
      `INSERT INTO chats (jid, name, is_group) VALUES ($1, $2, true)
       ON CONFLICT (jid) DO UPDATE SET name = coalesce(excluded.name, chats.name), updated_at = now()`,
      [g.id, g.subject ?? null],
    )
    const parts = g.participants ?? []
    if (!parts.length) continue // Teil-Updates ohne Teilnehmerliste ändern nichts an den Mitgliedern
    // Vollständige Liste: ersetzen. jid = Telefonnummer (falls bekannt), lid = anonyme ID (falls bekannt); gesucht wird über beide.
    await pool.query(`DELETE FROM group_participants WHERE chat_jid = $1`, [g.id])
    // dieselbe Person kann unter Nummer und LID doppelt auftauchen: nach jid zusammenführen
    const uniq = new Map<string, { jid: string; lid: string | null; admin: boolean }>()
    for (const p of parts) {
      const lid = p.lid ?? (p.id.endsWith('@lid') ? p.id : null)
      const jid = p.jid ?? p.id
      const prev = uniq.get(jid)
      uniq.set(jid, { jid, lid: prev?.lid ?? lid, admin: (prev?.admin ?? false) || !!p.admin })
    }
    await inChunks([...uniq.values()], async (chunk) => {
      const params: unknown[] = []
      for (const p of chunk) params.push(g.id, p.jid, p.lid, p.admin)
      await pool.query(
        `INSERT INTO group_participants (chat_jid, jid, lid, is_admin) VALUES ${placeholders(chunk.length, 4)}
         ON CONFLICT (chat_jid, jid) DO UPDATE SET lid = coalesce(excluded.lid, group_participants.lid), is_admin = excluded.is_admin`,
        params,
      )
    })
  }
}

type Parsed = {
  type: string
  body: string | null
  quotedId: string | null
  mediaMeta: Record<string, unknown> | null
}

const BULKY = new Set([
  'jpegThumbnail', 'streamingSidecar', 'scansSidecar', 'scanLengths', 'midQualityFileSha256', 'waveform',
  'thumbnailDirectPath', 'thumbnailSha256', 'thumbnailEncSha256', 'thumbnailHeight', 'thumbnailWidth',
])
function stripBulky<T>(o: T): T {
  if (Array.isArray(o)) o.forEach(stripBulky)
  else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      if (BULKY.has(k)) delete (o as Record<string, unknown>)[k]
      else stripBulky((o as Record<string, unknown>)[k])
    }
  }
  return o
}

/** Extrahiert Typ und durchsuchbaren Text; null = Nachricht überspringen (Protokoll-Nachrichten etc.). */
export function parseContent(raw: WAMessageContent | null | undefined): Parsed | null {
  const c = normalizeMessageContent(raw)
  if (!c) return null

  const quotedId =
    c.extendedTextMessage?.contextInfo?.stanzaId ??
    c.imageMessage?.contextInfo?.stanzaId ??
    c.videoMessage?.contextInfo?.stanzaId ??
    c.documentMessage?.contextInfo?.stanzaId ??
    null
  const base = { quotedId, mediaMeta: null as Record<string, unknown> | null }

  if (c.conversation) return { ...base, type: 'text', body: c.conversation }
  if (c.extendedTextMessage) return { ...base, type: 'text', body: c.extendedTextMessage.text ?? null }
  if (c.imageMessage)
    return { ...base, type: 'image', body: c.imageMessage.caption ?? null, mediaMeta: { mimetype: c.imageMessage.mimetype } }
  if (c.videoMessage)
    return { ...base, type: 'video', body: c.videoMessage.caption ?? null, mediaMeta: { mimetype: c.videoMessage.mimetype, seconds: c.videoMessage.seconds } }
  if (c.audioMessage)
    return { ...base, type: 'audio', body: null, mediaMeta: { seconds: c.audioMessage.seconds, ptt: c.audioMessage.ptt } }
  if (c.documentMessage)
    return {
      ...base,
      type: 'document',
      body: [c.documentMessage.fileName, c.documentMessage.caption].filter(Boolean).join(' – ') || null,
      mediaMeta: { mimetype: c.documentMessage.mimetype },
    }
  if (c.stickerMessage) return { ...base, type: 'sticker', body: null }
  if (c.locationMessage || c.liveLocationMessage) {
    const l = c.locationMessage ?? c.liveLocationMessage!
    return {
      ...base,
      type: 'location',
      body: c.locationMessage ? [c.locationMessage.name, c.locationMessage.address].filter(Boolean).join(', ') || null : c.liveLocationMessage?.caption ?? null,
      mediaMeta: { lat: l.degreesLatitude, lng: l.degreesLongitude },
    }
  }
  if (c.contactMessage) return { ...base, type: 'contact', body: c.contactMessage.displayName ?? null }
  if (c.contactsArrayMessage) return { ...base, type: 'contact', body: c.contactsArrayMessage.displayName ?? null }
  const poll = c.pollCreationMessage ?? c.pollCreationMessageV2 ?? c.pollCreationMessageV3
  if (poll) {
    const opts = (poll.options ?? []).map((o) => o.optionName).filter(Boolean)
    return { ...base, type: 'poll', body: `Umfrage: ${poll.name}\n${opts.map((o) => `- ${o}`).join('\n')}` }
  }
  if (c.reactionMessage)
    return { ...base, type: 'reaction', body: c.reactionMessage.text ?? null, quotedId: c.reactionMessage.key?.id ?? null }
  if (c.protocolMessage || c.pollUpdateMessage || c.senderKeyDistributionMessage || c.messageContextInfo && Object.keys(c).length === 1)
    return null
  return { ...base, type: 'other', body: null }
}

export async function upsertMessages(msgs: WAMessage[]) {
  type Row = unknown[]
  const rows: Row[] = []
  for (const m of msgs) {
    const chat = m.key.remoteJid
    const id = m.key.id
    if (!chat || !id || IGNORED_CHATS(chat)) continue
    // Verlaufs-Import: Reaktionen stecken in der Nachricht selbst
    for (const rc of m.reactions ?? []) {
      const fromMeR = !!rc.key?.fromMe
      const reactor = fromMeR ? selfJid() : (rc.key?.participant ?? rc.key?.remoteJid ?? chat)
      await upsertReaction(chat, id, jidNormalizedUser(reactor), rc.text ?? '', fromMeR, toNumber(rc.senderTimestampMs)).catch(() => {})
    }
    const parsed = parseContent(m.message)
    if (!parsed) continue
    const t = toNumber(m.messageTimestamp)
    if (!t) continue
    const fromMe = !!m.key.fromMe
    const sender = fromMe ? selfJid() : m.key.participant ?? m.participant ?? chat
    // Rohdaten für Umfragen (Stimmen entschlüsseln) und Medien (Download, Weiterleiten); ohne Vorschaubilder
    const keepRaw = ['poll', 'audio', 'image', 'video', 'document', 'sticker'].includes(parsed.type)
    const raw = keepRaw ? stripBulky(JSON.parse(JSON.stringify(m, BufferJSON.replacer))) : null
    rows.push([
      id,
      chat,
      sender,
      fromMe,
      new Date(t * 1000),
      parsed.type,
      parsed.body,
      parsed.quotedId,
      parsed.mediaMeta ? JSON.stringify(parsed.mediaMeta) : null,
      raw ? JSON.stringify(raw) : null,
      parsed.type === 'audio' ? 'pending' : null,
    ])
  }
  await inChunks(rows, async (chunk) => {
    // Chats, die nur über Nachrichten bekannt sind, sicherstellen
    const chatIds = [...new Set(chunk.map((r) => r[1] as string))]
    await pool.query(
      `INSERT INTO chats (jid, is_group) SELECT x, x LIKE '%@g.us' FROM unnest($1::text[]) x ON CONFLICT DO NOTHING`,
      [chatIds],
    )
    await pool.query(
      `INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body, quoted_id, media_meta, raw, transcript_status)
       VALUES ${placeholders(chunk.length, 11)}
       ON CONFLICT (chat_jid, id) DO UPDATE SET
         -- bereits angereicherte Texte (Bildbeschreibung, Transkript) nie durch einen erneuten Import überschreiben
         body = CASE WHEN messages.media_status = 'done' OR messages.transcript_status = 'done' THEN messages.body
                     ELSE coalesce(excluded.body, messages.body) END,
         raw = coalesce(excluded.raw, messages.raw)`,
      chunk.flat(),
    )
    await pool.query(
      `UPDATE chats SET last_message_at = greatest(last_message_at, sub.mx)
       FROM (SELECT chat_jid, max(ts) mx FROM messages WHERE chat_jid = ANY($1) GROUP BY chat_jid) sub
       WHERE chats.jid = sub.chat_jid`,
      [chatIds],
    )
  })
}

/** Liefert die gespeicherte Original-Umfrage (für Baileys' getMessage-Callback und die Stimmen-Entschlüsselung). */
export async function loadPoll(chatJid: string, id: string): Promise<WAMessage | undefined> {
  const r = await pool.query(`SELECT raw FROM messages WHERE chat_jid = $1 AND id = $2 AND type = 'poll'`, [chatJid, id])
  if (!r.rows[0]?.raw) return undefined
  return JSON.parse(JSON.stringify(r.rows[0].raw), BufferJSON.reviver) as WAMessage
}

export const getSelfIds = () => selfIds

export function pollOptionNames(poll: WAMessage): string[] {
  const c = poll.message
  const p = c?.pollCreationMessage ?? c?.pollCreationMessageV2 ?? c?.pollCreationMessageV3
  return (p?.options ?? []).map((o) => o.optionName ?? '').filter(Boolean)
}

/**
 * Baileys entschlüsselt Umfrage-Stimmen in dieser Version nicht mehr selbst.
 * Wir lesen die Stimm-Nachrichten (pollUpdateMessage) hier aus und entschlüsseln sie mit dem Poll-Secret.
 */
export async function handlePollVotes(msgs: WAMessage[]) {
  for (const m of msgs) {
    const upd = normalizeMessageContent(m.message)?.pollUpdateMessage
    if (!upd?.pollCreationMessageKey?.id || !upd.vote || !m.key.remoteJid) continue
    const ck = upd.pollCreationMessageKey
    const chat = ck.remoteJid ?? m.key.remoteJid
    const poll = await loadPoll(chat, ck.id!)
    const secret = poll?.message?.messageContextInfo?.messageSecret
    if (!poll || !secret) continue

    const creators = ck.fromMe ? selfIds : [jidNormalizedUser(ck.participant ?? ck.remoteJid ?? chat)]
    const voters = m.key.fromMe ? selfIds : [jidNormalizedUser(m.key.participant ?? m.participant ?? m.key.remoteJid!)]

    let selected: Uint8Array[] | null = null
    outer: for (const pollCreatorJid of creators) {
      for (const voterJid of voters) {
        try {
          const vote = decryptPollVote(upd.vote as never, { pollEncKey: secret, pollCreatorJid, pollMsgId: ck.id!, voterJid })
          selected = (vote.selectedOptions ?? []) as Uint8Array[]
          break outer
        } catch {
          /* andere Adress-Variante (PN/LID) probieren */
        }
      }
    }
    if (!selected) continue

    const byHash = new Map(pollOptionNames(poll).map((n) => [Buffer.from(sha256(Buffer.from(n))).toString('hex'), n]))
    const chosen = selected.map((h) => byHash.get(Buffer.from(h).toString('hex'))).filter((x): x is string => !!x)
    const voter = m.key.fromMe ? selfJid() : voters[0]
    if (chosen.length === 0) {
      await pool.query(`DELETE FROM poll_votes WHERE chat_jid = $1 AND poll_msg_id = $2 AND voter_jid = $3`, [chat, ck.id, voter])
    } else {
      const ts = toNumber(upd.senderTimestampMs) ?? toNumber(m.messageTimestamp)
      await pool.query(
        `INSERT INTO poll_votes (chat_jid, poll_msg_id, voter_jid, options, ts) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (chat_jid, poll_msg_id, voter_jid) DO UPDATE SET options = excluded.options, ts = excluded.ts
         WHERE excluded.ts >= poll_votes.ts`,
        [chat, ck.id, voter, chosen, ts ? new Date(ts > 1e12 ? ts : ts * 1000) : new Date()],
      )
    }
  }
}

/**
 * Der History-Sync liefert Stimmen bereits entschlüsselt in message.pollUpdates (Hashes der gewählten Optionen).
 * Hier in poll_votes übernehmen; neuere Stimmen gewinnen, eine leere Auswahl entfernt die Stimme.
 */
export async function importPollUpdates(msgs: WAMessage[]) {
  for (const m of msgs) {
    const updates = m.pollUpdates
    if (!updates?.length || !m.key.remoteJid || !m.key.id) continue
    const names = pollOptionNames(m)
    if (!names.length) continue
    const byHash = new Map(names.map((n) => [Buffer.from(sha256(Buffer.from(n))).toString('hex'), n]))
    const chat = m.key.remoteJid
    for (const u of updates) {
      const k = u.pollUpdateMessageKey
      const voter = k?.fromMe ? selfJid() : k?.participant ? jidNormalizedUser(k.participant) : null
      if (!voter) continue
      const chosen = (u.vote?.selectedOptions ?? [])
        .map((h) => byHash.get(Buffer.from(h).toString('hex')))
        .filter((x): x is string => !!x)
      const t = toNumber(u.senderTimestampMs)
      const ts = t ? new Date(t > 1e12 ? t : t * 1000) : new Date()
      if (chosen.length === 0) {
        await pool.query(
          `DELETE FROM poll_votes WHERE chat_jid = $1 AND poll_msg_id = $2 AND voter_jid = $3 AND ts <= $4`,
          [chat, m.key.id, voter, ts],
        )
      } else {
        await pool.query(
          `INSERT INTO poll_votes (chat_jid, poll_msg_id, voter_jid, options, ts) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (chat_jid, poll_msg_id, voter_jid) DO UPDATE SET options = excluded.options, ts = excluded.ts
           WHERE excluded.ts >= poll_votes.ts`,
          [chat, m.key.id, voter, chosen, ts],
        )
      }
    }
  }
}

/** Bearbeitete und gelöschte Nachrichten (von anderen) nachziehen. Inhalte bleiben im Archiv, werden aber markiert. */
export async function handleProtocol(msgs: WAMessage[]) {
  for (const m of msgs) {
    const pm = normalizeMessageContent(m.message)?.protocolMessage
    if (!pm?.key?.id) continue
    const chat = pm.key.remoteJid ?? m.key.remoteJid
    if (!chat) continue
    if (pm.type === proto.Message.ProtocolMessage.Type.REVOKE) {
      await pool.query(`UPDATE messages SET deleted_at = now() WHERE chat_jid = $1 AND id = $2`, [chat, pm.key.id])
    } else if (pm.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) {
      const parsed = parseContent(pm.editedMessage)
      if (parsed?.body != null) {
        await pool.query(`UPDATE messages SET body = $3, edited_at = now(), embedding = NULL WHERE chat_jid = $1 AND id = $2`, [
          chat,
          pm.key.id,
          parsed.body,
        ])
      }
    }
  }
}

/**
 * Medien aus dem Verlauf haben oft keinen "url"-Schlüssel, nur directPath + mediaKey. Baileys' Download prüft aber
 * auf das Vorhandensein von "url" und lädt dann ohnehin über directPath. Daher den Schlüssel leer setzen.
 */
export function prepareMediaForDownload(msg: WAMessage): WAMessage {
  const c = normalizeMessageContent(msg.message) as Record<string, any> | undefined
  for (const k of ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage']) {
    const media = c?.[k]
    if (media && typeof media === 'object' && !('url' in media)) media.url = ''
  }
  return msg
}

/**
 * Dieselbe Person kommt unter zwei Kennungen vor: Telefonnummer (@s.whatsapp.net, mit Adressbuchname) und LID (@lid, oft ohne Namen).
 * Über die Gruppenteilnehmer (dort stehen beide) werden fehlende Namen/Nummern der LID-Kontakte aus dem Adressbuch ergänzt.
 * Betrifft nur LIDs, die in Chats oder als Absender vorkommen; vorhandene Namen werden nie überschrieben.
 */
export async function fillLidNames(): Promise<number> {
  const map = `SELECT DISTINCT ON (lid) lid, jid FROM group_participants WHERE lid IS NOT NULL AND jid LIKE '%@s.whatsapp.net' ORDER BY lid, jid`
  await pool.query(
    `INSERT INTO contacts (jid, name, push_name, phone)
     SELECT m.lid, pc.name, pc.push_name, pc.phone FROM (${map}) m JOIN contacts pc ON pc.jid = m.jid
     WHERE (m.lid IN (SELECT jid FROM chats) OR m.lid IN (SELECT DISTINCT sender_jid FROM messages WHERE sender_jid LIKE '%@lid'))
     ON CONFLICT (jid) DO NOTHING`,
  )
  const r = await pool.query(
    `UPDATE contacts c SET name = coalesce(c.name, pc.name), push_name = coalesce(c.push_name, pc.push_name), phone = coalesce(c.phone, pc.phone), updated_at = now()
     FROM (${map}) m JOIN contacts pc ON pc.jid = m.jid
     WHERE c.jid = m.lid AND (c.name IS NULL AND pc.name IS NOT NULL OR c.push_name IS NULL AND pc.push_name IS NOT NULL OR c.phone IS NULL AND pc.phone IS NOT NULL)`,
  )
  return r.rowCount ?? 0
}

/** Eine Reaktion speichern oder (leeres Emoji = zurückgenommen) entfernen. */
export async function upsertReaction(chat: string, targetId: string, reactor: string, emoji: string, fromMe: boolean, tsMs?: number | null) {
  if (!emoji) {
    await pool.query(`DELETE FROM message_reactions WHERE chat_jid = $1 AND message_id = $2 AND reactor_jid = $3`, [chat, targetId, reactor])
    return
  }
  const ts = tsMs ? new Date(Number(tsMs)) : new Date()
  await pool.query(
    `INSERT INTO message_reactions (chat_jid, message_id, reactor_jid, emoji, from_me, ts) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (chat_jid, message_id, reactor_jid) DO UPDATE SET emoji = excluded.emoji, from_me = excluded.from_me, ts = excluded.ts
     WHERE excluded.ts >= message_reactions.ts`,
    [chat, targetId, reactor, emoji, fromMe, ts],
  )
}

/** Live-Ereignis messages.reaction: key = Zielnachricht, reaction.key = wer reagiert hat. */
export async function handleReactionEvents(events: { key: { remoteJid?: string | null; id?: string | null }; reaction: { key?: { fromMe?: boolean | null; participant?: string | null; remoteJid?: string | null } | null; text?: string | null; senderTimestampMs?: unknown } }[]) {
  for (const e of events) {
    const chat = e.key.remoteJid
    const target = e.key.id
    if (!chat || !target) continue
    const fromMe = !!e.reaction.key?.fromMe
    const reactor = fromMe ? selfJid() : (e.reaction.key?.participant ?? e.reaction.key?.remoteJid ?? chat)
    await upsertReaction(chat, target, jidNormalizedUser(reactor), e.reaction.text ?? '', fromMe, toNumber(e.reaction.senderTimestampMs))
  }
}
