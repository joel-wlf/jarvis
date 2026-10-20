import { BufferJSON, downloadMediaMessage, type WAMessage, type WASocket } from '@whiskeysockets/baileys'
import { spawn } from 'node:child_process'
import pino from 'pino'
import { pool, prepareMediaForDownload } from './store.js'

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' }).child({ module: 'transcribe' })

const OPENAI_KEY = process.env.OPENAI_API_KEY
const PROVIDER = process.env.TRANSCRIBE_PROVIDER || (OPENAI_KEY ? 'openai' : 'local')
const OPENAI_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
const WHISPER_URL = process.env.WHISPER_URL
const LANG = process.env.WHISPER_LANG ?? 'de'
const MAX_SECONDS = Number(process.env.MAX_AUDIO_SECONDS ?? 600)
// Auf einem Pi 4 läuft Whisper nur ~1x-0,07x Echtzeit: ältere Sprachnachrichten werden nicht transkribiert
const MAX_AGE_DAYS = Number(process.env.TRANSCRIBE_MAX_AGE_DAYS || (PROVIDER === 'openai' ? 3650 : 14))
const MAX_ATTEMPTS = 3
const IDLE_MS = 5000

/** Re-Kodierung als Notlösung, wenn OpenAI das Original ablehnt. */
function toMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', '-f', 'mp3', 'pipe:1'])
    const out: Buffer[] = []
    ff.stdout.on('data', (d) => out.push(d))
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error('ffmpeg konnte die Datei nicht lesen'))))
    ff.stdin.on('error', () => {})
    ff.stdin.end(input)
  })
}

let sock: WASocket | null = null
let running = false

/** Wird bei jeder (Wieder-)Verbindung aufgerufen; die Schleife läuft nur einmal. */
export function setTranscriberSocket(s: WASocket | null) {
  sock = s
  if (s && !running && (PROVIDER === 'openai' ? !!OPENAI_KEY : !!WHISPER_URL)) {
    running = true
    loop().catch((e) => {
      running = false
      log.error(e, 'Transkriptions-Schleife abgestürzt')
    })
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function loop() {
  log.info({ lang: LANG, provider: PROVIDER, model: PROVIDER === 'openai' ? OPENAI_MODEL : 'whisper.cpp' }, 'Transkription aktiv')
  for (;;) {
    if (!sock) {
      await sleep(IDLE_MS)
      continue
    }
    // Neueste zuerst: aktuelle Nachrichten sind wichtiger als das Archiv
    const r = await pool.query(
      `UPDATE messages SET transcript_attempts = transcript_attempts + 1
       WHERE (chat_jid, id) = (
         SELECT chat_jid, id FROM messages
         WHERE transcript_status = 'pending' AND transcript_attempts < $1 AND ts > now() - make_interval(days => $2::int)
         ORDER BY ts DESC LIMIT 1)
       RETURNING chat_jid, id, raw, media_meta, transcript_attempts`,
      [MAX_ATTEMPTS, MAX_AGE_DAYS],
    )
    const job = r.rows[0]
    if (!job) {
      // zu alte Sprachnachrichten überspringen
      await pool.query(
        `UPDATE messages SET transcript_status = 'skipped'
         WHERE transcript_status = 'pending' AND ts <= now() - make_interval(days => $1::int)`,
        [MAX_AGE_DAYS],
      )
      // Aufgaben, die alle Versuche verbraucht haben, abschließen
      await pool.query(
        `UPDATE messages SET transcript_status = 'failed' WHERE transcript_status = 'pending' AND transcript_attempts >= $1`,
        [MAX_ATTEMPTS],
      )
      await sleep(IDLE_MS)
      continue
    }
    try {
      await transcribeOne(job)
    } catch (e) {
      const err = e as Error & { transient?: boolean }
      log.warn({ id: job.id, attempt: job.transcript_attempts, err: err.message }, 'Transkription fehlgeschlagen')
      if (/unable to authenticate|empty media key|status code 40[0-9]|status code 410|Download-Timeout|corrupted or unsupported/i.test(err.message)) {
        // Datei nicht (mehr) verfügbar bzw. nicht lesbar: nicht wiederholen
        await pool.query(`UPDATE messages SET transcript_status = 'failed' WHERE chat_jid = $1 AND id = $2`, [job.chat_jid, job.id])
      } else if (err.transient) {
        // Dienst überlastet/nicht erreichbar: Versuch zurückgeben und warten
        await pool.query(`UPDATE messages SET transcript_attempts = transcript_attempts - 1 WHERE chat_jid = $1 AND id = $2`, [job.chat_jid, job.id])
        await sleep(30_000)
      } else await sleep(2000)
    }
  }
}

async function transcribeOne(job: { chat_jid: string; id: string; raw: unknown; media_meta: { seconds?: number } | null }) {
  if ((job.media_meta?.seconds ?? 0) > MAX_SECONDS) {
    await pool.query(`UPDATE messages SET transcript_status = 'skipped' WHERE chat_jid = $1 AND id = $2`, [job.chat_jid, job.id])
    return
  }
  if (!job.raw) throw new Error('keine Rohdaten gespeichert')
  const msg = prepareMediaForDownload(JSON.parse(JSON.stringify(job.raw), BufferJSON.reviver) as WAMessage)
  // Abgelaufene Dateien werden beim Handy neu angefordert (reuploadRequest). Antwortet das Handy nicht, nicht ewig warten.
  const download = downloadMediaMessage(msg, 'buffer', {}, { logger: log as never, reuploadRequest: sock!.updateMediaMessage }) as Promise<Buffer>
  const buf = await Promise.race([
    download,
    sleep(45_000).then(() => Promise.reject(new Error('Download-Timeout (Handy hat die Datei nicht neu hochgeladen)'))),
  ])

  let text: string | undefined
  if (PROVIDER === 'openai') {
    const send = async (data: Buffer, type: string, name: string): Promise<Response> => {
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(data)], { type }), name)
      fd.append('model', OPENAI_MODEL)
      fd.append('response_format', 'json')
      if (LANG !== 'auto') fd.append('language', LANG)
      try {
        return await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_KEY}` },
          body: fd,
          signal: AbortSignal.timeout(120_000),
        })
      } catch (e) {
        throw Object.assign(new Error(`OpenAI nicht erreichbar: ${(e as Error).message}`), { transient: true })
      }
    }
    let res = await send(buf, 'audio/ogg', 'voice.ogg')
    if (res.status === 400) {
      // Original abgelehnt: einmal mit ffmpeg neu kodieren (ungewöhnliche Container, abgeschnittene Dateien)
      try {
        res = await send(await toMp3(buf), 'audio/mpeg', 'voice.mp3')
      } catch {
        /* bleibt beim ursprünglichen 400 */
      }
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      throw Object.assign(new Error(`OpenAI HTTP ${res.status}: ${detail}`), { transient: res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403 })
    }
    text = ((await res.json()) as { text?: string }).text
  } else {
    const fd = new FormData()
    fd.append('file', new Blob([new Uint8Array(buf)], { type: 'audio/ogg' }), 'voice.ogg')
    fd.append('response_format', 'json')
    fd.append('language', LANG)
    fd.append('temperature', '0')
    let res: Response
    try {
      res = await fetch(`${WHISPER_URL}/inference`, { method: 'POST', body: fd, signal: AbortSignal.timeout(20 * 60_000) })
    } catch (e) {
      throw Object.assign(new Error(`lokaler Whisper nicht erreichbar: ${(e as Error).message}`), { transient: true })
    }
    if (!res.ok) throw new Error(`whisper HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    text = ((await res.json()) as { text?: string }).text
  }
  const clean = (text ?? '').replace(/\[[A-Z_ ]+\]/g, '').replace(/\s+/g, ' ').trim()

  // Rohdaten (Schlüssel für den Download) werden nach Erfolg nicht mehr gebraucht
  await pool.query(
    `UPDATE messages SET body = $3, transcript_status = 'done', raw = NULL WHERE chat_jid = $1 AND id = $2`,
    [job.chat_jid, job.id, clean || null],
  )
  log.info({ id: job.id, chars: clean.length }, 'Sprachnachricht transkribiert')
}
