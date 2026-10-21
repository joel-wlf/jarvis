// Test harness: an in-process Postgres (PGlite) with every db/init/*.sql migration, and the app on a random port.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch'
import { useDatabases, type Db } from '../src/db.js'
import { createApps, type AppOptions, type Apps } from '../src/server.js'

const INIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/init')

export const MCP_TOKEN = 'legacy-token-'.padEnd(48, 'x')
export const ADMIN_SECRET = 'internal-secret-for-tests'

export async function testDb(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { vector, pg_trgm, fuzzystrmatch } })
  await pg.waitReady
  for (const f of fs.readdirSync(INIT).filter((x) => x.endsWith('.sql')).sort()) await pg.exec(fs.readFileSync(path.join(INIT, f), 'utf8'))
  const db: Db = {
    query: (async (text: string, params?: unknown[]) => {
      const r = await pg.query(text, params as any[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, command: '', oid: 0, fields: [] }
    }) as Db['query'],
    connect: async () => ({ query: db.query, release() {} }),
  }
  useDatabases({ ro: db, mem: db, act: db })
  return pg
}

export interface Running extends Apps {
  url: string
  internalUrl: string
  close(): Promise<void>
}

export async function start(opts: Partial<AppOptions> = {}): Promise<Running> {
  const server = http.createServer()
  const internalServer = http.createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => internalServer.listen(0, '127.0.0.1', r))
  const url = `http://localhost:${(server.address() as AddressInfo).port}`
  const internalUrl = `http://127.0.0.1:${(internalServer.address() as AddressInfo).port}`
  const apps = createApps({ publicUrl: new URL(url), mcpToken: MCP_TOKEN, legacyToken: true, adminSecret: ADMIN_SECRET, oauthRateLimit: false, ...opts })
  server.on('request', apps.app)
  internalServer.on('request', apps.internal)
  return {
    ...apps,
    url,
    internalUrl,
    close: async () => {
      server.closeAllConnections()
      internalServer.closeAllConnections()
      await new Promise((r) => server.close(r))
      await new Promise((r) => internalServer.close(r))
    },
  }
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

export const form = (body: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body).toString(),
  redirect: 'manual' as const,
})

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

/** Plays wa-ingest: marks pending outbox jobs as done. */
export function fakeWorker(pg: PGlite): () => void {
  const iv = setInterval(() => {
    pg.query(`UPDATE outbox SET status = 'done', result = '{}', done_at = now() WHERE status = 'pending'`).catch(() => {})
  }, 50)
  return () => clearInterval(iv)
}

export async function setOnline(pg: PGlite) {
  await pg.query(
    `INSERT INTO meta (key, value) VALUES ('wa_status','open'), ('wa_heartbeat', $1), ('self_jid','me@s.whatsapp.net')
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [new Date().toISOString()],
  )
}
