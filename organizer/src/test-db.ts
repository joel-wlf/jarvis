import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { Queryable } from './lib.js'

// In-memory Postgres for tests: the tables the card code touches, plus the real cards migration.
const MIGRATION = new URL('../../db/init/015_cards_organizer.sql', import.meta.url)

export async function testDb(): Promise<Queryable & { pg: PGlite }> {
  const pg = new PGlite()
  await pg.exec(`
    CREATE TABLE contacts (jid text PRIMARY KEY, name text, push_name text);
    CREATE TABLE chats (jid text PRIMARY KEY, name text, is_group boolean NOT NULL DEFAULT false);
    CREATE TABLE messages (
      id text NOT NULL, chat_jid text NOT NULL, sender_jid text, from_me boolean NOT NULL DEFAULT false,
      ts timestamptz NOT NULL, type text NOT NULL, body text, media_meta jsonb, deleted_at timestamptz,
      PRIMARY KEY (chat_jid, id));
    CREATE TABLE organizer_exclusions (chat_jid text PRIMARY KEY, reason text);
  `)
  await pg.exec(readFileSync(MIGRATION, 'utf8'))
  return {
    pg,
    query: async (text, params) => {
      const r = await pg.query(text, params as unknown[])
      return { rows: r.rows as any[], rowCount: r.affectedRows ?? 0 }
    },
  }
}

let seq = 0
export async function msg(db: Queryable, m: { chat: string; sender?: string; fromMe?: boolean; ts: Date; type?: string; body?: string | null }) {
  await db.query(`INSERT INTO messages (id, chat_jid, sender_jid, from_me, ts, type, body) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    `m${++seq}`, m.chat, m.fromMe ? 'me@s' : m.sender ?? m.chat, !!m.fromMe, m.ts.toISOString(), m.type ?? 'text', m.body ?? null,
  ])
}

export const hoursAgo = (h: number, now = new Date()) => new Date(now.getTime() - h * 3600_000)
