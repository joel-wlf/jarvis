import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import {
  aesEncryptGCM,
  downloadMediaMessage,
  hmacSign,
  jidNormalizedUser,
  proto,
  sha256,
  BufferJSON,
  type AnyMessageContent,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { fillLidNames, getSelfIds, loadPoll, pollOptionNames, pool, prepareMediaForDownload } from './store.js'


/** Re-encodes audio as MP3 (64 kbit/s mono) with ffmpeg, which the image already ships for transcription. */
function toMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-b:a', '64k', '-f', 'mp3', 'pipe:1'])
    const out: Buffer[] = []
    ff.stdout.on('data', (d: Buffer) => out.push(d))
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error('Audio konnte nicht umgewandelt werden'))))
    ff.stdin.on('error', () => {})
    ff.stdin.end(input)
  })
}

async function namedCount(): Promise<number> {
  const r = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM contacts WHERE NOT is_group AND coalesce(name, push_name) IS NOT NULL`)
  return Number(r.rows[0]?.n ?? 0)
}

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' }).child({ module: 'actions' })

let sock: WASocket | null = null
let running = false
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function setActionSocket(s: WASocket | null) {
  sock = s
  if (s && !running) {
    running = true
    loop().catch((e) => {
      running = false
      log.error(e, 'Aktions-Schleife abgestürzt')
    })
  }
}

type Job = { id: string; kind: string; chat_jid: string; payload: Record<string, any> }

async function loop() {
  // Nach einem Absturz mitten im Senden ist unklar, ob die Nachricht rausging -> nicht automatisch wiederholen
  await pool.query(
    `UPDATE outbox SET status = 'failed', error = 'Unterbrochen, unklar ob gesendet', done_at = now() WHERE status = 'sending'`,
  )
  log.info('Aktionen aktiv')
  for (;;) {
    if (!sock) {
      await sleep(2000)
      continue
    }
    const r = await pool.query<Job>(
      `UPDATE outbox SET status = 'sending'
       WHERE id = (SELECT id FROM outbox WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, kind, chat_jid, payload`,
    )
    const job = r.rows[0]
    if (!job) {
      // heruntergeladene Medien nicht dauerhaft in der DB lassen
      await pool.query(
        `UPDATE outbox SET result = NULL WHERE kind = 'download_media' AND result IS NOT NULL AND done_at < now() - interval '5 minutes'`,
      )
      await sleep(700)
      continue
    }
    try {
      const result = await run(sock, job)
      await pool.query(`UPDATE outbox SET status = 'done', result = $2, done_at = now() WHERE id = $1`, [job.id, result])
      log.info({ id: job.id, kind: job.kind }, 'Aktion ausgeführt')
    } catch (e) {
      const msg = (e as Error).message
      await pool.query(`UPDATE outbox SET status = 'failed', error = $2, done_at = now() WHERE id = $1`, [job.id, msg])
      log.warn({ id: job.id, kind: job.kind, err: msg }, 'Aktion fehlgeschlagen')
    }
    await sleep(1500) // Abstand zwischen Aktionen
  }
}

interface StoredMsg {
  sender_jid: string | null
  from_me: boolean
  body?: string | null
}

async function loadMsg(chat: string, id: string): Promise<StoredMsg> {
  const r = await pool.query<StoredMsg>(`SELECT sender_jid, from_me, body FROM messages WHERE chat_jid = $1 AND id = $2`, [chat, id])
  if (!r.rows[0]) throw new Error('Nachricht nicht in der Datenbank gefunden')
  return r.rows[0]
}

const keyOf = (chat: string, id: string, m: StoredMsg) => ({
  remoteJid: chat,
  id,
  fromMe: m.from_me,
  ...(chat.endsWith('@g.us') && !m.from_me && m.sender_jid ? { participant: m.sender_jid } : {}),
})

const OUT_DIR = path.resolve(process.env.OUTGOING_DIR ?? '/outgoing')
const MAX_MEDIA_BYTES = 64 * 1024 * 1024

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus', wav: 'audio/wav', pdf: 'application/pdf',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const mimeFor = (name: string | undefined, fallback: string) =>
  MIME[(name?.split('.').pop() ?? '').toLowerCase()] ?? fallback

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    if (l === '::' || l === '::1' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return m ? isPrivateIp(m[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  )
}

/** Lädt nur von öffentlichen Adressen (kein Zugriff auf Router, Pi-Dienste oder Cloud-Metadaten). */
async function fetchPublic(url: string): Promise<Buffer> {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http(s)-URLs erlaubt')
    for (const a of await lookup(u.hostname, { all: true })) {
      if (isPrivateIp(a.address)) throw new Error('URL zeigt auf eine private Adresse – blockiert')
    }
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, u).toString()
      continue
    }
    if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`)
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += c.length
      if (size > MAX_MEDIA_BYTES) throw new Error('Datei größer als 64 MB')
      chunks.push(c)
    }
    return Buffer.concat(chunks)
  }
  throw new Error('Zu viele Weiterleitungen')
}

async function loadBuffer(p: { url?: string; file?: string; base64?: string }): Promise<Buffer> {
  if (p.base64) return Buffer.from(p.base64, 'base64')
  if (p.file) {
    const full = path.resolve(OUT_DIR, p.file)
    if (!full.startsWith(OUT_DIR + path.sep)) throw new Error('Datei muss im Ordner outgoing/ liegen')
    return readFile(full).catch(() => {
      throw new Error(`Datei "${p.file}" nicht in outgoing/ gefunden`)
    })
  }
  if (p.url) return fetchPublic(p.url)
  throw new Error('Quelle fehlt (url, file oder base64)')
}

/** Sprachnachrichten müssen ogg/opus sein, sonst zeigt WhatsApp sie nicht als Sprachnachricht. */
function toOpus(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'])
    const out: Buffer[] = []
    ff.stdout.on('data', (d) => out.push(d))
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error('ffmpeg-Konvertierung fehlgeschlagen'))))
    ff.stdin.on('error', () => {})
    ff.stdin.end(input)
  })
}

interface StoredFull extends StoredMsg {
  type: string
  ts: Date
  raw: unknown
}

async function loadFull(chat: string, id: string): Promise<StoredFull> {
  const r = await pool.query<StoredFull>(
    `SELECT sender_jid, from_me, body, type, ts, raw FROM messages WHERE chat_jid = $1 AND id = $2`,
    [chat, id],
  )
  if (!r.rows[0]) throw new Error('Nachricht nicht in der Datenbank gefunden')
  return r.rows[0]
}

/** Stellt sicher, dass eine neue Telefonnummer wirklich WhatsApp nutzt. */
async function ensureReachable(s: WASocket, jid: string) {
  if (!jid.endsWith('@s.whatsapp.net')) return
  const known = await pool.query(`SELECT 1 FROM chats WHERE jid = $1`, [jid])
  if (known.rows[0]) return
  const [res] = (await s.onWhatsApp(jid)) ?? []
  if (!res?.exists) throw new Error('Diese Nummer nutzt kein WhatsApp')
}

async function lastMessages(chat: string) {
  const r = await pool.query<{ id: string; sender_jid: string | null; from_me: boolean; ts: Date }>(
    `SELECT id, sender_jid, from_me, ts FROM messages WHERE chat_jid = $1 ORDER BY ts DESC LIMIT 1`,
    [chat],
  )
  if (!r.rows[0]) throw new Error('Chat hat keine Nachrichten in der Datenbank')
  const m = r.rows[0]
  return [{ key: keyOf(chat, m.id, m), messageTimestamp: Math.floor(m.ts.getTime() / 1000) }]
}

const jidList = (xs: string[]) => xs.map((x) => (x.includes('@') ? x : `${x.replace(/\D/g, '')}@s.whatsapp.net`))

async function run(s: WASocket, job: Job): Promise<Record<string, unknown>> {
  const p = job.payload
  const chat = job.chat_jid
  switch (job.kind) {
    // ---------- Nachrichten senden ----------
    case 'send_text': {
      await ensureReachable(s, chat)
      let quoted: WAMessage | undefined
      if (p.reply_to) {
        const m = await loadMsg(chat, p.reply_to)
        quoted = { key: keyOf(chat, p.reply_to, m), message: { conversation: m.body ?? '' } } as WAMessage
      }
      // kurz "schreibt ..." anzeigen, wirkt natürlicher und reduziert Sperrrisiko
      await s.sendPresenceUpdate('composing', chat).catch(() => {})
      await sleep(Math.min(300 + String(p.text).length * 25, 3500))
      const sent = await s.sendMessage(
        chat,
        { text: p.text, ...(p.mentions?.length ? { mentions: p.mentions } : {}) },
        quoted ? { quoted } : undefined,
      )
      await s.sendPresenceUpdate('paused', chat).catch(() => {})
      return { message_id: sent?.key.id }
    }
    case 'send_media': {
      await ensureReachable(s, chat)
      let buf = await loadBuffer(p)
      const name: string | undefined = p.filename ?? p.file ?? (p.url ? new URL(p.url).pathname.split('/').pop() : undefined)
      let content: AnyMessageContent
      switch (p.media_kind) {
        case 'image':
          content = { image: buf, caption: p.caption, mimetype: p.mimetype ?? mimeFor(name, 'image/jpeg') }
          break
        case 'video':
          content = { video: buf, caption: p.caption, mimetype: p.mimetype ?? mimeFor(name, 'video/mp4'), gifPlayback: !!p.gif }
          break
        case 'audio':
          content = { audio: buf, mimetype: p.mimetype ?? mimeFor(name, 'audio/mpeg') }
          break
        case 'voice':
          buf = await toOpus(buf)
          content = { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true }
          break
        case 'sticker':
          content = { sticker: buf }
          break
        default:
          content = {
            document: buf,
            fileName: name ?? 'datei',
            mimetype: p.mimetype ?? mimeFor(name, 'application/octet-stream'),
            caption: p.caption,
          }
      }
      const sent = await s.sendMessage(chat, content)
      return { message_id: sent?.key.id, bytes: buf.length }
    }
    case 'send_location': {
      await ensureReachable(s, chat)
      const sent = await s.sendMessage(chat, {
        location: { degreesLatitude: p.lat, degreesLongitude: p.lng, name: p.name, address: p.address },
      })
      return { message_id: sent?.key.id }
    }
    case 'send_contact': {
      await ensureReachable(s, chat)
      const vcard =
        `BEGIN:VCARD\nVERSION:3.0\nFN:${p.name}\nTEL;type=CELL;waid=${p.phone}:+${p.phone}\nEND:VCARD`
      const sent = await s.sendMessage(chat, { contacts: { displayName: p.name, contacts: [{ vcard }] } })
      return { message_id: sent?.key.id }
    }
    case 'forward': {
      await ensureReachable(s, chat)
      const src = await loadFull(p.src_chat, p.message_id)
      let msg: WAMessage
      if (src.raw) {
        msg = JSON.parse(JSON.stringify(src.raw), BufferJSON.reviver) as WAMessage
      } else if (src.body) {
        msg = { key: keyOf(p.src_chat, p.message_id, src), message: { conversation: src.body } } as WAMessage
      } else {
        throw new Error('Diese Nachricht kann nicht weitergeleitet werden (kein Inhalt gespeichert)')
      }
      const sent = await s.sendMessage(chat, { forward: msg })
      return { message_id: sent?.key.id }
    }
    case 'edit': {
      const m = await loadMsg(chat, p.message_id)
      if (!m.from_me) throw new Error('Nur eigene Nachrichten können bearbeitet werden')
      await s.sendMessage(chat, { text: p.text, edit: keyOf(chat, p.message_id, m) })
      await pool.query(`UPDATE messages SET body = $3, edited_at = now(), embedding = NULL WHERE chat_jid = $1 AND id = $2`, [chat, p.message_id, p.text])
      return { ok: true }
    }
    case 'delete': {
      const m = await loadMsg(chat, p.message_id)
      if (p.scope === 'everyone') {
        await s.sendMessage(chat, { delete: keyOf(chat, p.message_id, m) })
        await pool.query(`UPDATE messages SET deleted_at = now() WHERE chat_jid = $1 AND id = $2`, [chat, p.message_id])
      } else {
        const f = await loadFull(chat, p.message_id)
        await s.chatModify(
          { deleteForMe: { deleteMedia: true, key: keyOf(chat, p.message_id, m), timestamp: Math.floor(f.ts.getTime() / 1000) } },
          chat,
        )
      }
      return { ok: true }
    }
    case 'react': {
      const m = await loadMsg(chat, p.message_id)
      await s.sendMessage(chat, { react: { text: p.emoji, key: keyOf(chat, p.message_id, m) } })
      return { ok: true }
    }
    case 'create_poll': {
      await ensureReachable(s, chat)
      const sent = await s.sendMessage(chat, {
        poll: { name: p.question, values: p.options, selectableCount: p.multiple ? 0 : 1 },
      })
      return { message_id: sent?.key.id }
    }
    case 'vote':
      return vote(s, chat, p.poll_id, p.options)

    // ---------- Chat verwalten ----------
    case 'chat_modify': {
      switch (p.action) {
        case 'archive': case 'unarchive':
          await s.chatModify({ archive: p.action === 'archive', lastMessages: await lastMessages(chat) }, chat)
          break
        case 'pin': case 'unpin':
          await s.chatModify({ pin: p.action === 'pin' }, chat)
          break
        case 'mute':
          await s.chatModify({ mute: Date.now() + (p.hours ?? 8) * 3_600_000 }, chat)
          break
        case 'unmute':
          await s.chatModify({ mute: null }, chat)
          break
        case 'mark_read': case 'mark_unread': {
          const lm = await lastMessages(chat)
          await s.chatModify({ markRead: p.action === 'mark_read', lastMessages: lm }, chat)
          if (p.action === 'mark_read') {
            const unread = await pool.query<{ id: string; sender_jid: string | null; from_me: boolean }>(
              `SELECT id, sender_jid, from_me FROM messages WHERE chat_jid = $1 AND NOT from_me ORDER BY ts DESC LIMIT 20`,
              [chat],
            )
            if (unread.rows.length) await s.readMessages(unread.rows.map((m) => keyOf(chat, m.id, m)))
          }
          break
        }
        case 'clear':
          await s.chatModify({ clear: true, lastMessages: await lastMessages(chat) }, chat)
          break
        case 'delete':
          await s.chatModify({ delete: true, lastMessages: await lastMessages(chat) }, chat)
          break
        default:
          throw new Error(`Unbekannte Chat-Aktion ${p.action}`)
      }
      return { ok: true }
    }
    case 'presence':
      await s.sendPresenceUpdate(p.state, chat)
      return { ok: true }
    case 'star': {
      const m = await loadMsg(chat, p.message_id)
      await s.chatModify({ star: { messages: [{ id: p.message_id, fromMe: m.from_me }], star: p.star } }, chat)
      return { ok: true }
    }
    case 'disappearing':
      if (chat.endsWith('@g.us')) await s.groupToggleEphemeral(chat, p.seconds)
      else await s.sendMessage(chat, { disappearingMessagesInChat: p.seconds || false })
      return { seconds: p.seconds }

    // ---------- Gruppen ----------
    case 'group_create': {
      const g = await s.groupCreate(p.subject, jidList(p.participants))
      return { jid: g.id, subject: g.subject }
    }
    case 'group_info': {
      const g = await s.groupMetadata(chat)
      return {
        jid: g.id, subject: g.subject, description: g.desc, owner: g.owner,
        created: g.creation ? new Date(g.creation * 1000).toISOString() : null,
        announce_only: !!g.announce, locked: !!g.restrict, join_approval: !!g.joinApprovalMode,
        member_add_mode: g.memberAddMode ? 'all_member_add' : 'admin_add', disappearing_seconds: g.ephemeralDuration ?? 0,
        participants: g.participants.map((x) => ({ jid: x.id, admin: x.admin ?? null })),
      }
    }
    case 'group_update': {
      if (p.subject != null) await s.groupUpdateSubject(chat, p.subject)
      if (p.description != null) await s.groupUpdateDescription(chat, p.description)
      if (p.announce_only != null) await s.groupSettingUpdate(chat, p.announce_only ? 'announcement' : 'not_announcement')
      if (p.locked != null) await s.groupSettingUpdate(chat, p.locked ? 'locked' : 'unlocked')
      if (p.members_can_add != null) await s.groupMemberAddMode(chat, p.members_can_add ? 'all_member_add' : 'admin_add')
      if (p.join_approval != null) await s.groupJoinApprovalMode(chat, p.join_approval ? 'on' : 'off')
      if (p.picture) await s.updateProfilePicture(chat, await loadBuffer(p.picture))
      return { ok: true }
    }
    case 'group_members': {
      const r = await s.groupParticipantsUpdate(chat, jidList(p.participants), p.action)
      return { results: r }
    }
    case 'group_leave':
      await s.groupLeave(chat)
      return { ok: true }
    case 'group_invite': {
      const code = p.action === 'revoke' ? await s.groupRevokeInvite(chat) : await s.groupInviteCode(chat)
      return { link: code ? `https://chat.whatsapp.com/${code}` : null }
    }
    case 'group_join': {
      const code = String(p.code).replace(/^.*chat\.whatsapp\.com\//, '').trim()
      const jid = await s.groupAcceptInvite(code)
      return { jid }
    }
    case 'group_requests': {
      if (p.action === 'list') return { requests: await s.groupRequestParticipantsList(chat) }
      const r = await s.groupRequestParticipantsUpdate(chat, jidList(p.participants), p.action)
      return { results: r }
    }

    // ---------- Kontakte & Profil ----------
    case 'check_numbers': {
      const r = await s.onWhatsApp(...jidList(p.phones))
      return { results: (r ?? []).map((x) => ({ jid: x.jid, exists: x.exists })) }
    }
    case 'get_profile': {
      const [st] = (await s.fetchStatus(chat).catch(() => undefined)) ?? []
      const picture = await s.profilePictureUrl(chat, 'image').catch(() => undefined)
      return { jid: chat, about: (st as any)?.status?.status ?? null, about_set_at: (st as any)?.status?.setAt ?? null, picture_url: picture ?? null }
    }
    case 'block':
      await s.updateBlockStatus(chat, p.block ? 'block' : 'unblock')
      return { ok: true }
    case 'blocklist':
      return { blocked: (await s.fetchBlocklist()).filter(Boolean) }
    case 'update_profile': {
      const me = getSelfIds()[0]
      if (p.name) await s.updateProfileName(p.name)
      if (p.about != null) await s.updateProfileStatus(p.about)
      if (p.remove_picture) await s.removeProfilePicture(me)
      else if (p.picture) await s.updateProfilePicture(me, await loadBuffer(p.picture))
      return { ok: true }
    }
    case 'privacy': {
      if (p.action === 'get') return { settings: await s.fetchPrivacySettings(true) }
      const v = p.value
      switch (p.setting) {
        case 'last_seen': await s.updateLastSeenPrivacy(v); break
        case 'online': await s.updateOnlinePrivacy(v); break
        case 'profile_picture': await s.updateProfilePicturePrivacy(v); break
        case 'status': await s.updateStatusPrivacy(v); break
        case 'read_receipts': await s.updateReadReceiptsPrivacy(v); break
        case 'groups_add': await s.updateGroupsAddPrivacy(v); break
        default: throw new Error(`Unbekannte Einstellung ${p.setting}`)
      }
      return { ok: true }
    }

    // ---------- Kontaktnamen neu abgleichen ----------
    case 'resync_contacts': {
      // Names from the phone's address book arrive as app state ("critical_unblock_low"), normally only once after
      // linking. Forgetting the stored version makes WhatsApp send the full snapshot again; contacts.upsert stores it.
      const before = await namedCount()
      await s.authState.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } })
      await s.resyncAppState(['critical_unblock_low'], false)
      await new Promise((r) => setTimeout(r, 1500)) // contacts.upsert is written asynchronously
      await fillLidNames()
      const after = await namedCount()
      return { before, after }
    }

    // ---------- Medien ansehen ----------
    case 'download_media': {
      const f = await loadFull(chat, p.message_id)
      if (!f.raw) throw new Error('Keine Medien-Schlüssel gespeichert (Nachricht kam vor der Einrichtung oder ist kein Medium)')
      const msg = prepareMediaForDownload(JSON.parse(JSON.stringify(f.raw), BufferJSON.reviver) as WAMessage)
      const buf = (await downloadMediaMessage(msg, 'buffer', {}, { logger: log as never, reuploadRequest: s.updateMediaMessage })) as Buffer
      const c = msg.message
      const mimetype =
        c?.imageMessage?.mimetype ?? c?.stickerMessage?.mimetype ?? c?.documentMessage?.mimetype ??
        c?.videoMessage?.mimetype ?? c?.audioMessage?.mimetype ?? 'application/octet-stream'
      if (buf.length > 8 * 1024 * 1024) throw new Error(`Datei zu groß zum Anzeigen (${Math.round(buf.length / 1048576)} MB)`)
      // Voice messages are Ogg/Opus, which Safari and iOS cannot play: hand out MP3 when asked
      if (p.as === 'mp3' && f.type === 'audio') {
        const mp3 = await toMp3(buf)
        return { mimetype: 'audio/mpeg', type: f.type, bytes: mp3.length, base64: mp3.toString('base64') }
      }
      return { mimetype, type: f.type, bytes: buf.length, base64: buf.toString('base64') }
    }
    default:
      throw new Error(`Unbekannte Aktion: ${job.kind}`)
  }
}

/**
 * Stimme abgeben. Baileys hat dafür keine API, daher wird das Gegenstück zu decryptPollVote nachgebaut
 * (HMAC-abgeleiteter Schlüssel, AES-256-GCM) und als pollUpdateMessage gesendet.
 */
async function vote(s: WASocket, chat: string, pollId: string, options: string[]) {
  const poll: WAMessage | undefined = await loadPoll(chat, pollId)
  const secret = poll?.message?.messageContextInfo?.messageSecret
  if (!poll || !secret) throw new Error('Umfrage-Secret nicht verfügbar (Umfrage evtl. zu alt oder nicht vollständig synchronisiert)')

  const valid = pollOptionNames(poll)
  const chosen = options.map((o) => {
    const hit = valid.find((v) => v.toLowerCase() === o.toLowerCase())
    if (!hit) throw new Error(`Unbekannte Option "${o}". Gültig: ${valid.join(' | ')}`)
    return hit
  })

  const [mePn, meLid] = getSelfIds()
  // In Gruppen mit LID-Adressierung muss die LID als Absender in die Verschlüsselung
  let voter = mePn
  if (chat.endsWith('@g.us') && meLid) {
    const md = await s.groupMetadata(chat).catch(() => null)
    if (md?.addressingMode === 'lid') voter = meLid
  }
  const creator = poll.key.fromMe ? mePn : jidNormalizedUser(poll.key.participant ?? poll.key.remoteJid ?? chat)

  const sign = Buffer.concat([
    Buffer.from(pollId),
    Buffer.from(creator),
    Buffer.from(voter),
    Buffer.from('Poll Vote'),
    new Uint8Array([1]),
  ])
  const key0 = hmacSign(secret, new Uint8Array(32), 'sha256')
  const encKey = hmacSign(sign, key0, 'sha256')
  const iv = randomBytes(12)
  const aad = Buffer.from(`${pollId}\u0000${voter}`)
  const plain = proto.Message.PollVoteMessage.encode({
    selectedOptions: chosen.map((n) => sha256(Buffer.from(n))),
  }).finish()

  await s.relayMessage(
    chat,
    {
      pollUpdateMessage: {
        pollCreationMessageKey: {
          remoteJid: chat,
          id: pollId,
          fromMe: !!poll.key.fromMe,
          ...(poll.key.participant ? { participant: poll.key.participant } : {}),
        },
        vote: { encPayload: aesEncryptGCM(plain, encKey, iv, aad), encIv: iv },
        senderTimestampMs: Date.now(),
      },
    },
    {},
  )
  // Eigene Stimme sofort lokal festhalten
  await pool.query(
    `INSERT INTO poll_votes (chat_jid, poll_msg_id, voter_jid, options, ts) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (chat_jid, poll_msg_id, voter_jid) DO UPDATE SET options = excluded.options, ts = excluded.ts`,
    [chat, pollId, mePn, chosen],
  )
  return { voted: chosen }
}
