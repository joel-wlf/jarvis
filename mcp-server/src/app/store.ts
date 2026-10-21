// Owner password, paired devices and pairing codes (tables from db/init/014_app.sql, role mcp_mem).
import { ownerState, unifiedAuth, verifyOwner } from './owner-auth.js'
import type { Device } from '@jarvis/contract'
import { memDb } from '../db.js'
import { hashPassword, normalizePairingCode, pairingCode, randomToken, sha256, verifyPassword } from './crypto.js'

export const PAIRING_TTL_MS = 10 * 60_000
const MIN_PASSWORD = 10

// --- owner ---------------------------------------------------------------------------------------

export async function hasOwnerPassword(): Promise<boolean> {
  if (unifiedAuth()) return (await ownerState()).configured
  const r = await memDb.query(`SELECT 1 FROM app_owner WHERE id = 1`).catch(() => ({ rows: [] }))
  return r.rows.length > 0
}

export async function setOwnerPassword(pw: string) {
  if (unifiedAuth()) throw new Error('Change the owner password in the admin service')
  if (pw.length < MIN_PASSWORD) throw new Error(`Password must have at least ${MIN_PASSWORD} characters`)
  await memDb.query(
    `INSERT INTO app_owner (id, password_hash) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now()`,
    [await hashPassword(pw)],
  )
}

export async function checkOwnerPassword(pw: string, ip?: string): Promise<boolean> {
  if (unifiedAuth()) return verifyOwner(pw, ip)
  const r = await memDb.query<{ password_hash: string }>(`SELECT password_hash FROM app_owner WHERE id = 1`)
  if (!r.rows[0]) return false
  return verifyPassword(pw, r.rows[0].password_hash)
}

// --- devices -------------------------------------------------------------------------------------

export interface DeviceRow {
  id: string
  name: string
  platform: 'ios' | 'android' | 'web'
  created_at: Date
  last_seen_at: Date | null
}

export async function createDevice(name: string, platform: DeviceRow['platform']): Promise<{ id: string; token: string }> {
  const token = randomToken('jd_')
  const r = await memDb.query<{ id: string }>(`INSERT INTO devices (token_hash, name, platform) VALUES ($1,$2,$3) RETURNING id`, [sha256(token), name, platform])
  return { id: r.rows[0].id, token }
}

export async function deviceByToken(token: string): Promise<DeviceRow | null> {
  if (unifiedAuth() && !(await ownerState()).configured) return null
  const r = await memDb.query<DeviceRow>(
    `SELECT id, name, platform, created_at, last_seen_at FROM devices WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  )
  const d = r.rows[0]
  if (!d) return null
  // last seen, at most every 5 minutes
  memDb
    .query(`UPDATE devices SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')`, [d.id])
    .catch(() => {})
  return d
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined)

/** Paired devices and OAuth clients with live tokens, newest first. */
export async function listDevices(current?: { kind: 'device' | 'oauth'; id: string }): Promise<Device[]> {
  const dev = await memDb.query<DeviceRow>(`SELECT id, name, platform, created_at, last_seen_at FROM devices WHERE revoked_at IS NULL ORDER BY created_at DESC`)
  const oa = await memDb.query<{ client_id: string; name: string | null; created_at: Date; last_used_at: Date | null }>(
    `SELECT c.client_id, c.metadata->>'client_name' AS name, min(t.created_at) AS created_at, max(t.last_used_at) AS last_used_at
     FROM oauth_clients c JOIN oauth_tokens t ON t.client_id = c.client_id
     WHERE c.revoked_at IS NULL AND t.revoked_at IS NULL AND coalesce(t.refresh_expires_at, t.access_expires_at) > now()
     GROUP BY c.client_id, c.metadata->>'client_name' ORDER BY min(t.created_at) DESC`,
  )
  const out: Device[] = dev.rows.map((d) => ({
    id: d.id, name: d.name, platform: d.platform, kind: 'device', createdAt: iso(d.created_at)!, lastSeenAt: iso(d.last_seen_at),
    ...(current?.kind === 'device' && current.id === d.id ? { current: true } : {}),
  }))
  for (const c of oa.rows) {
    out.push({
      id: c.client_id, name: c.name || 'MCP client', platform: 'mcp', kind: 'oauth', createdAt: iso(c.created_at)!, lastSeenAt: iso(c.last_used_at),
      ...(current?.kind === 'oauth' && current.id === c.client_id ? { current: true } : {}),
    })
  }
  return out
}

/** Revoke a device, or all tokens of an OAuth client. Returns false if the id is unknown. */
export async function revokeDevice(id: string): Promise<boolean> {
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const r = await memDb.query(`UPDATE devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id])
    if (r.rowCount) return true
  }
  const c = await memDb.query(`UPDATE oauth_clients SET revoked_at = now() WHERE client_id = $1 AND revoked_at IS NULL`, [id])
  if (!c.rowCount) return false
  await memDb.query(`UPDATE oauth_tokens SET revoked_at = now() WHERE client_id = $1 AND revoked_at IS NULL`, [id])
  return true
}

// --- pairing -------------------------------------------------------------------------------------

export async function createPairingCode(ttlMs = PAIRING_TTL_MS): Promise<{ code: string; expiresAt: Date }> {
  const code = pairingCode()
  const expiresAt = new Date(Date.now() + ttlMs)
  await memDb.query(`DELETE FROM pairing_codes WHERE expires_at < now() - interval '1 day'`)
  await memDb.query(`INSERT INTO pairing_codes (code_hash, expires_at) VALUES ($1,$2)`, [sha256(normalizePairingCode(code)), expiresAt])
  return { code, expiresAt }
}

/** Single use: the code is consumed atomically before the device is created. */
export async function redeemPairingCode(code: string, name: string, platform: DeviceRow['platform']): Promise<{ id: string; token: string } | null> {
  const hash = sha256(normalizePairingCode(code))
  const r = await memDb.query(
    `UPDATE pairing_codes SET used_at = now() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING code_hash`,
    [hash],
  )
  if (!r.rowCount) return null
  const dev = await createDevice(name, platform)
  await memDb.query(`UPDATE pairing_codes SET device_id = $2 WHERE code_hash = $1`, [hash, dev.id])
  return dev
}
