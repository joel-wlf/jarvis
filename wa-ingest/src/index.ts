import { Boom } from '@hapi/boom'
import fs from 'node:fs'
import path from 'node:path'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { setActionSocket } from './actions.js'
import { setImageSocket } from './images.js'
import { setTranscriberSocket } from './transcribe.js'
import {
  handlePollVotes,
  importPollUpdates,
  handleProtocol,
  handleReactionEvents,
  loadPoll,
  pool,
  setSelf,
  upsertChats,
  upsertContacts,
  upsertGroups,
  fillLidNames,
  upsertMessages,
} from './store.js'

const AUTH_DIR = process.env.AUTH_DIR ?? './auth'
// Optional: Verknüpfen per Kopplungscode statt QR (Telefonnummer mit Ländervorwahl, nur Ziffern)
const PAIRING_PHONE = (process.env.WA_PAIRING_PHONE ?? '').replace(/\D/g, '')
const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })

let groupTimer: NodeJS.Timeout | undefined
let beatTimer: NodeJS.Timeout | undefined

// Verknüpfungsstatus für die Admin-Oberfläche (QR/Kopplungscode im Browser). Atomar geschrieben, Fehler sind egal.
const STATUS_FILE = process.env.WA_STATUS_FILE ?? '/data/status/link.json'
type LinkState = { state: 'starting' | 'qr' | 'pairing' | 'open' | 'closed' | 'logged_out'; qr?: string; pairingCode?: string; user?: string; error?: string }
function writeLinkStatus(s: LinkState) {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true })
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ ...s, at: new Date().toISOString() }), { mode: 0o600 })
    fs.renameSync(tmp, STATUS_FILE)
  } catch {
    // Ordner nicht gemountet (z.B. lokale Entwicklung): ignorieren
  }
}

/** Verbindungsstatus für den MCP-Server: "open" + Herzschlag alle 15 s. Ohne frischen Herzschlag gilt WhatsApp als nicht erreichbar. */
async function setWaStatus(open: boolean) {
  clearInterval(beatTimer)
  const write = () =>
    pool
      .query(
        `INSERT INTO meta (key, value) VALUES ('wa_status', $1), ('wa_heartbeat', $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [open ? 'open' : 'closed', new Date().toISOString()],
      )
      .catch(() => {})
  await write()
  if (open) beatTimer = setInterval(() => void write(), 15_000)
}

/** Alle Gruppen samt Teilnehmern abrufen (für "gemeinsame Gruppen" u.a.). Selten genug, um WhatsApp nicht zu belasten. */
async function syncGroups(sock: ReturnType<typeof makeWASocket>) {
  try {
    const all = await sock.groupFetchAllParticipating()
    const groups = Object.values(all)
    await upsertGroups(groups)
    const named = await fillLidNames()
    if (named) log.info({ named }, 'Namen für LID-Kontakte aus dem Adressbuch ergänzt')
    log.info({ groups: groups.length, participants: groups.reduce((n, g) => n + (g.participants?.length ?? 0), 0) }, 'Gruppen synchronisiert')
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'Gruppen-Synchronisierung fehlgeschlagen')
  }
}

async function start() {
  writeLinkStatus({ state: 'starting' })
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()
  const baileysLog = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? 'warn' })

  const sock = makeWASocket({
    version,
    logger: baileysLog,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLog) },
    // Browser-Profil "Ubuntu Chrome": WhatsApp lehnt syncFullHistory mit den Desktop-Profilen (macOS/Windows) aktuell
    // sofort mit "Connection Terminated" (428) ab; getestet auf dem Pi, nur dieses Profil verbindet mit vollem History-Sync.
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: true,
    markOnlineOnConnect: false, // wir lesen nur mit, Handy soll weiter Benachrichtigungen zeigen
    getMessage: async (key) => {
      if (!key.remoteJid || !key.id) return undefined
      return (await loadPoll(key.remoteJid, key.id))?.message ?? undefined
    },
  })

  let pairingRequested = false
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (PAIRING_PHONE && !sock.authState.creds.registered) {
        // Kopplungscode statt QR: WhatsApp > Verknüpfte Geräte > Gerät hinzufügen > "Stattdessen mit Telefonnummer verknüpfen"
        if (!pairingRequested) {
          pairingRequested = true
          try {
            const code = await sock.requestPairingCode(PAIRING_PHONE)
            writeLinkStatus({ state: 'pairing', pairingCode: code.match(/.{1,4}/g)?.join('-') ?? code })
            log.info(`KOPPLUNGSCODE: ${code.match(/.{1,4}/g)?.join('-') ?? code}  (am Handy eingeben; gilt nur kurz)`)
          } catch (e) {
            log.error({ err: (e as Error).message }, 'Kopplungscode konnte nicht angefordert werden')
            writeLinkStatus({ state: 'closed', error: `Kopplungscode fehlgeschlagen: ${(e as Error).message}` })
          }
        }
      } else {
        log.info('Bitte QR-Code in WhatsApp scannen (Einstellungen > Verknüpfte Geräte > Gerät hinzufügen):')
        qrcode.generate(qr, { small: true })
        writeLinkStatus({ state: 'qr', qr })
      }
    }
    if (connection === 'open') {
      await setSelf([sock.user?.id, sock.user?.lid])
      setTranscriberSocket(sock)
      setActionSocket(sock)
      setImageSocket(sock)
      log.info({ user: sock.user?.id }, 'WhatsApp verbunden')
      writeLinkStatus({ state: 'open', user: sock.user?.id?.replace(/[:@].*$/, '') })
      await setWaStatus(true)
      clearInterval(groupTimer)
      setTimeout(() => void syncGroups(sock), 20_000)
      groupTimer = setInterval(() => void syncGroups(sock), 6 * 3_600_000)
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        writeLinkStatus({ state: 'logged_out' })
        log.error('Abgemeldet. Volume wa-auth löschen (docker compose down; docker volume rm jarvis_wa-auth) und neu verknüpfen.')
        process.exit(1)
      }
      setTranscriberSocket(null)
      setActionSocket(null)
      setImageSocket(null)
      await setWaStatus(false)
      writeLinkStatus({ state: 'closed', error: (lastDisconnect?.error as Error | undefined)?.message })
      log.warn({ code, reason: (lastDisconnect?.error as Error | undefined)?.message }, 'Verbindung getrennt, starte neu ...')
      setTimeout(() => start().catch(fatal), 3000)
    }
  })

  // Reihenfolge wichtig: Kontakte/Chats vor Nachrichten
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest, progress }) => {
    try {
      await upsertContacts(contacts)
      await upsertChats(chats)
      await upsertMessages(messages)
      await handlePollVotes(messages)
      await importPollUpdates(messages)
      await handleProtocol(messages)
      log.info(
        { chats: chats.length, contacts: contacts.length, messages: messages.length, isLatest, progress },
        'History-Batch importiert',
      )
    } catch (e) {
      log.error(e, 'History-Import fehlgeschlagen')
    }
  })

  sock.ev.on('contacts.upsert', (c) => upsertContacts(c).catch((e) => log.error(e)))
  sock.ev.on('contacts.update', (c) => upsertContacts(c).catch((e) => log.error(e)))
  sock.ev.on('chats.upsert', (c) => upsertChats(c).catch((e) => log.error(e)))
  sock.ev.on('chats.update', (c) => upsertChats(c).catch((e) => log.error(e)))
  // Beitritt/Austritt/Admin-Änderungen: betroffene Gruppe kurz verzögert neu laden (vollständige Liste mit Nummer und LID)
  const groupRefresh = new Map<string, NodeJS.Timeout>()
  sock.ev.on('group-participants.update', ({ id }) => {
    clearTimeout(groupRefresh.get(id))
    groupRefresh.set(
      id,
      setTimeout(() => {
        groupRefresh.delete(id)
        sock
          .groupMetadata(id)
          .then((meta) => upsertGroups([meta]))
          .catch((e) => log.warn({ err: (e as Error).message, group: id }, 'Gruppenmitglieder konnten nicht aktualisiert werden'))
      }, 3000),
    )
  })
  sock.ev.on('groups.upsert', (g) => upsertGroups(g).catch((e) => log.error(e)))
  sock.ev.on('groups.update', (g) => upsertGroups(g).catch((e) => log.error(e)))

  sock.ev.on('messages.upsert', ({ messages }) => {
    upsertMessages(messages)
      .then(() => handlePollVotes(messages))
      .then(() => handleProtocol(messages))
      .catch((e) => log.error(e, 'messages.upsert fehlgeschlagen'))
  })
}

function fatal(e: unknown) {
  log.fatal(e)
  process.exit(1)
}

process.on('SIGTERM', () => pool.end().finally(() => process.exit(0)))
start().catch(fatal)
