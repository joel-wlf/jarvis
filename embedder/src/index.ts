import http from 'node:http'
// Bewusst transformers.js v2 (onnxruntime 1.14): neuere ONNX-Binärdateien stürzen auf dem Raspberry Pi 4 mit SIGILL ab
import { env, pipeline } from '@xenova/transformers'
import pg from 'pg'

const MODEL = process.env.EMBED_MODEL ?? 'Xenova/multilingual-e5-small'
const BATCH = Number(process.env.EMBED_BATCH || (process.env.OPENAI_API_KEY && process.env.EMBED_PROVIDER !== 'local' ? 100 : 32))
const PORT = Number(process.env.PORT ?? 3001)
const OPENAI_KEY = process.env.OPENAI_API_KEY
const PROVIDER = process.env.EMBED_PROVIDER || (OPENAI_KEY ? 'openai' : 'local')
const OPENAI_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
const DIM = 384 // Spaltengröße vector(384); OpenAI-Modelle liefern auf Wunsch gekürzte Vektoren
const MODEL_ID = PROVIDER === 'openai' ? `openai:${OPENAI_MODEL}:${DIM}` : `local:${MODEL}`
const REDACT = process.env.ORGANIZER_REDACT !== 'false'
const EXCLUDE_NAMES = (process.env.ORGANIZER_EXCLUDE_NAMES ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const E5 = PROVIDER === 'local' && /e5/i.test(MODEL) // e5-Modelle brauchen die Präfixe "query: " / "passage: "

env.cacheDir = process.env.MODEL_DIR ?? '/models'
env.allowRemoteModels = false

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

// pipeline() hat sehr komplexe Overload-Typen; wir brauchen nur den Aufruf
type Extractor = (inputs: string[], opts: object) => Promise<{ tolist(): unknown }>
let extractor: Extractor | null = null
let ready = false
let queryLoad = 0

/** Schwärzt Telefonnummern, IBANs, E-Mail-Adressen und Link-Pfade, bevor Text an OpenAI geht. */
function redact(t: string): string {
  if (!REDACT) return t
  return t
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, '[IBAN]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[E-Mail]')
    .replace(/https?:\/\/([^/\s]+)\S*/g, '[Link $1]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[Nummer]' : m))
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, input: texts, dimensions: DIM, encoding_format: 'float' }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

async function embed(texts: string[], type: 'query' | 'passage'): Promise<number[][]> {
  if (PROVIDER === 'openai') return embedOpenAI(type === 'passage' ? texts.map(redact) : texts)
  const inputs = texts.map((t) => (E5 ? `${type}: ${t}` : t))
  const out = await extractor!(inputs, { pooling: 'mean', normalize: true })
  return out.tolist() as number[][]
}

const vec = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(',')}]`

// ---------------------------------------------------------------- Hintergrund: fehlende Embeddings berechnen
interface Row {
  chat_jid: string
  id: string
  body: string
  chat_name: string | null
  sender: string | null
  thread_title: string | null
}

async function backfillThreads(): Promise<number> {
  const r = await pool.query<{ id: string; title: string; summary: string | null; chat_name: string | null }>(
    `SELECT t.id, t.title, t.summary, coalesce(c.name, cc.name, cc.push_name) AS chat_name
     FROM threads t LEFT JOIN chats c ON c.jid = t.chat_jid LEFT JOIN contacts cc ON cc.jid = t.chat_jid
     WHERE t.embedding IS NULL
       AND NOT ($2::boolean AND EXISTS (SELECT 1 FROM organizer_exclusions e WHERE e.chat_jid = t.chat_jid))
     ORDER BY t.id LIMIT $1`,
    [BATCH, PROVIDER === 'openai'],
  )
  if (!r.rows.length) return 0
  const vectors = await embed(r.rows.map((t) => `${t.chat_name ?? ''}: ${t.title}. ${t.summary ?? ''}`.slice(0, 1200)), 'passage')
  await pool.query(
    `UPDATE threads t SET embedding = x.e::vector FROM unnest($1::bigint[], $2::text[]) AS x(id, e) WHERE t.id = x.id AND t.embedding IS NULL`,
    [r.rows.map((t) => t.id), vectors.map(vec)],
  )
  return r.rows.length
}

async function backfillTopics(): Promise<number> {
  const r = await pool.query<{ id: string; title: string; summary: string | null }>(
    `SELECT id, title, summary FROM topics WHERE embedding IS NULL ORDER BY id LIMIT $1`,
    [BATCH],
  )
  if (!r.rows.length) return 0
  const vectors = await embed(r.rows.map((t) => `${t.title}. ${t.summary ?? ''}`.slice(0, 1200)), 'passage')
  await pool.query(
    `UPDATE topics t SET embedding = x.e::vector FROM unnest($1::bigint[], $2::text[]) AS x(id, e) WHERE t.id = x.id AND t.embedding IS NULL`,
    [r.rows.map((t) => t.id), vectors.map(vec)],
  )
  return r.rows.length
}

async function backfillMemories(): Promise<number> {
  const r = await pool.query<{ id: string; content: string }>(
    `SELECT id, content FROM memories WHERE embedding IS NULL AND active ORDER BY id LIMIT $1`,
    [BATCH],
  )
  if (!r.rows.length) return 0
  const vectors = await embed(r.rows.map((m) => m.content.slice(0, 1200)), 'passage')
  await pool.query(
    `UPDATE memories m SET embedding = x.e::vector FROM unnest($1::bigint[], $2::text[]) AS x(id, e) WHERE m.id = x.id AND m.embedding IS NULL`,
    [r.rows.map((m) => m.id), vectors.map(vec)],
  )
  return r.rows.length
}

async function backfillOnce(): Promise<number> {
  const nm = await backfillMemories().catch(() => 0) // Erinnerungen zuerst: wenige, aber sofort nach "merk dir" auffindbar
  if (nm) return nm
  const nto = await backfillTopics().catch(() => 0) // Tabelle evtl. noch nicht migriert
  if (nto) return nto
  const nt = await backfillThreads()
  if (nt) return nt
  const r = await pool.query<Row>(
    `SELECT m.chat_jid, m.id, m.body,
            coalesce(c.name, cc.name, cc.push_name) AS chat_name,
            CASE WHEN m.from_me THEN 'Ich' ELSE coalesce(sc.name, sc.push_name) END AS sender,
            th.title AS thread_title
     FROM messages m
     LEFT JOIN threads th ON th.id = m.thread_id
     LEFT JOIN chats c    ON c.jid  = m.chat_jid
     LEFT JOIN contacts cc ON cc.jid = m.chat_jid
     LEFT JOIN contacts sc ON sc.jid = m.sender_jid
     WHERE m.embedding IS NULL AND m.body IS NOT NULL AND length(m.body) >= 3
       AND m.type <> 'reaction' AND m.deleted_at IS NULL
       AND NOT ($2::boolean AND EXISTS (SELECT 1 FROM organizer_exclusions e WHERE e.chat_jid = m.chat_jid))
     ORDER BY m.ts DESC LIMIT $1`,
    [BATCH, PROVIDER === 'openai'],
  )
  if (!r.rows.length) return 0
  // Kontext (Chat, Absender) mit einbetten, damit "ok bis dann" nicht im Nichts hängt
  // Themen-Titel (falls der organizer die Nachricht einem Thema zugeordnet hat) gibt auch kurzen Nachrichten Kontext
  const texts = r.rows.map((m) =>
    `${[m.chat_name, m.sender, m.thread_title && `Thema: ${m.thread_title}`].filter(Boolean).join(' | ')}: ${m.body}`.slice(0, 1200),
  )
  const vectors = await embed(texts, 'passage')
  await pool.query(
    `UPDATE messages m SET embedding = t.e::vector
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(chat, id, body, e)
     WHERE m.chat_jid = t.chat AND m.id = t.id AND m.body = t.body`, // body-Vergleich: nicht überschreiben, falls zwischenzeitlich bearbeitet
    [r.rows.map((m) => m.chat_jid), r.rows.map((m) => m.id), r.rows.map((m) => m.body), vectors.map(vec)],
  )
  return r.rows.length
}

async function backfillLoop() {
  let total = 0
  for (;;) {
    try {
      if (queryLoad > 0) {
        await new Promise((r) => setTimeout(r, 200)) // Suchanfragen haben Vorrang
        continue
      }
      const n = await backfillOnce()
      total += n
      if (n) {
        if (total % (BATCH * 10) < BATCH) log(`${total} Nachrichten eingebettet`)
      } else {
        await new Promise((r) => setTimeout(r, 10_000))
      }
    } catch (e) {
      log('Backfill-Fehler:', (e as Error).message)
      await new Promise((r) => setTimeout(r, 15_000))
    }
  }
}

// ---------------------------------------------------------------- HTTP-API (nur im internen Docker-Netz)
const server = http.createServer(async (req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'GET' && req.url === '/healthz') return send(ready ? 200 : 503, { ready, model: MODEL_ID })
  if (req.method === 'POST' && req.url === '/embed') {
    if (!ready) return send(503, { error: 'Modell lädt noch' })
    const chunks: Buffer[] = []
    let size = 0
    for await (const c of req) {
      size += (c as Buffer).length
      if (size > 512_000) return send(413, { error: 'zu groß' })
      chunks.push(c as Buffer)
    }
    try {
      const { texts, type } = JSON.parse(Buffer.concat(chunks).toString())
      if (!Array.isArray(texts) || texts.length === 0 || texts.length > 64 || texts.some((t) => typeof t !== 'string'))
        return send(400, { error: 'texts: 1-64 Strings erwartet' })
      queryLoad++
      try {
        const vectors = await embed(texts.map((t: string) => t.slice(0, 2000)), type === 'passage' ? 'passage' : 'query')
        return send(200, { vectors, dim: vectors[0].length })
      } finally {
        queryLoad--
      }
    } catch (e) {
      return send(400, { error: (e as Error).message })
    }
  }
  send(404, { error: 'not found' })
})

async function applyExclusions() {
  if (PROVIDER !== 'openai') return
  for (const n of EXCLUDE_NAMES) {
    await pool.query(
      `INSERT INTO organizer_exclusions (chat_jid, reason)
       SELECT jid, 'Name enthält "' || $1 || '"' FROM v_chats WHERE name ILIKE '%' || $1 || '%' ON CONFLICT DO NOTHING`,
      [n],
    )
  }
}

/** Vektoren verschiedener Modelle sind nicht vergleichbar: beim Anbieterwechsel alles neu berechnen. */
async function checkModelSwitch() {
  const cur = await pool.query<{ value: string }>(`SELECT value FROM meta WHERE key = 'embedding_model'`)
  const prev = cur.rows[0]?.value
  if (prev !== MODEL_ID && !(prev === undefined && PROVIDER === 'local')) {
    log(`Embedding-Modell geändert (${prev ?? 'unbekannt'} -> ${MODEL_ID}): berechne alle Vektoren neu`)
    await pool.query(`UPDATE messages SET embedding = NULL WHERE embedding IS NOT NULL`)
    await pool.query(`UPDATE threads SET embedding = NULL WHERE embedding IS NOT NULL`)
    await pool.query(`UPDATE topics SET embedding = NULL WHERE embedding IS NOT NULL`).catch(() => {})
    await pool.query(`UPDATE memories SET embedding = NULL WHERE embedding IS NOT NULL`).catch(() => {})
  }
  await pool.query(`INSERT INTO meta (key, value) VALUES ('embedding_model', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [MODEL_ID])
}

async function main() {
  await checkModelSwitch()
  await applyExclusions()
  if (PROVIDER === 'openai') {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY fehlt')
    log(`Embeddings über OpenAI (${OPENAI_MODEL}, ${DIM} Dimensionen), Schwärzen ${REDACT ? 'an' : 'AUS'}, ausgeschlossene Namen: ${EXCLUDE_NAMES.join(', ') || '-'}`)
  } else {
    log('Lade Modell', MODEL)
    extractor = (await (pipeline as any)('feature-extraction', MODEL, { quantized: true })) as Extractor
  }
  ready = true
  log(`embedder bereit auf :${PORT}`)
  backfillLoop()
}
// HTTP schon vor dem Modell-Laden öffnen, damit der Healthcheck 503 statt Verbindungsfehler liefert
server.listen(PORT)
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
