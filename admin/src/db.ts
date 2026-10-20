import pg from 'pg'

export type Env = Record<string, string>

export interface DbStats {
  messages: number
  lastMessage: string | null
  embedPending: number | null
  audioPending: number | null
  outboxPending: number | null
  tokensToday: number | null
  heartbeat: string | null
}

/** Datenbankzugriff der Oberfläche. Austauschbar für Tests und den Entwicklungsmodus. */
export interface DbAccess {
  /** Prüft, ob sich alle Dienste mit den Passwörtern aus env anmelden können. Fehlertext oder null. */
  checkLogins(env: Env): Promise<string | null>
  /** Setzt das Passwort der Rollen (angemeldet als jarvis mit loginPassword). Alles oder nichts. */
  setRolePasswords(loginPassword: string, roles: string[], newPassword: string): Promise<void>
  stats(env: Env): Promise<DbStats | null>
}

const HOST = process.env.PGHOST_OVERRIDE || 'postgres'
const ROLES = new Set(['jarvis', 'mcp_ro', 'mcp_act', 'mcp_mem'])

function client(user: string, password: string) {
  return new pg.Client({
    host: HOST,
    port: 5432,
    database: 'jarvis',
    user,
    password,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 6_000,
  })
}

async function tryLogin(user: string, password: string): Promise<string | null> {
  const c = client(user, password)
  try {
    await c.connect()
    await c.query('select 1')
    return null
  } catch (e) {
    return (e as Error).message
  } finally {
    await c.end().catch(() => {})
  }
}

export class PgAccess implements DbAccess {
  async checkLogins(env: Env) {
    const logins: [string, string][] = [
      ['jarvis', env.POSTGRES_PASSWORD ?? ''],
      ['mcp_ro', env.MCP_RO_PASSWORD ?? ''],
      ['mcp_act', env.MCP_RO_PASSWORD ?? ''],
    ]
    // Kurz nach dem Start kann Postgres noch Verbindungen ablehnen: ein paar Versuche
    let last: string | null = null
    for (let attempt = 0; attempt < 6; attempt++) {
      last = null
      for (const [u, pw] of logins) {
        const err = await tryLogin(u, pw)
        if (err) {
          last = `Anmeldung als ${u} fehlgeschlagen: ${err}`
          break
        }
      }
      if (!last) return null
      if (/password authentication failed/i.test(last)) return last
      await new Promise((r) => setTimeout(r, 5_000))
    }
    return last
  }

  async setRolePasswords(loginPassword: string, roles: string[], newPassword: string) {
    if (!/^[A-Za-z0-9]{16,128}$/.test(newPassword)) throw new Error('Ungültiges neues Passwort.')
    const c = client('jarvis', loginPassword)
    await c.connect()
    try {
      await c.query('BEGIN')
      const existing = await c.query<{ rolname: string }>('select rolname from pg_roles where rolname = any($1)', [roles])
      for (const { rolname } of existing.rows) {
        if (!ROLES.has(rolname)) throw new Error(`Unerwartete Rolle ${rolname}`)
        await c.query(`ALTER ROLE ${rolname} PASSWORD ${c.escapeLiteral(newPassword)}`)
      }
      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      await c.end().catch(() => {})
    }
  }

  async stats(env: Env): Promise<DbStats | null> {
    if (!env.POSTGRES_PASSWORD) return null
    const c = client('jarvis', env.POSTGRES_PASSWORD)
    try {
      await c.connect()
    } catch {
      await c.end().catch(() => {})
      return null
    }
    const one = async <T>(sql: string): Promise<T | null> => {
      try {
        const r = await c.query(sql)
        return (r.rows[0]?.v ?? null) as T | null
      } catch {
        return null
      }
    }
    try {
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      return {
        messages: num(await one("select greatest(reltuples, 0)::bigint as v from pg_class where relname = 'messages'")) ?? 0,
        lastMessage: (await one<Date>('select ts as v from messages order by ts desc limit 1'))?.toISOString?.() ?? null,
        embedPending: num(await one('select count(*) as v from messages where embedding is null and body is not null')),
        audioPending: num(await one("select count(*) as v from messages where transcript_status = 'pending'")),
        outboxPending: num(await one("select count(*) as v from outbox where status in ('pending', 'sending')")),
        tokensToday: num(await one('select input_tokens + output_tokens as v from organizer_usage where day = current_date')),
        heartbeat: await one<string>("select value as v from meta where key = 'wa_heartbeat'"),
      }
    } finally {
      await c.end().catch(() => {})
    }
  }
}

/** Für Tests und den Entwicklungsmodus. */
export class FakeDb implements DbAccess {
  passwords = new Map<string, string>()
  loginError: string | null = null
  async checkLogins(env: Env) {
    if (this.loginError) return this.loginError
    const pg = this.passwords.get('jarvis')
    if (pg && pg !== env.POSTGRES_PASSWORD) return 'Anmeldung als jarvis fehlgeschlagen: password authentication failed'
    return null
  }
  async setRolePasswords(_login: string, roles: string[], pw: string) {
    for (const r of roles) this.passwords.set(r, pw)
  }
  async stats(): Promise<DbStats> {
    return { messages: 48213, lastMessage: new Date(Date.now() - 4 * 60_000).toISOString(), embedPending: 12, audioPending: 0, outboxPending: 0, tokensToday: 184000, heartbeat: new Date().toISOString() }
  }
}
