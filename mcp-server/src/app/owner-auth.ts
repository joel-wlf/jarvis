import { memDb } from '../db.js'
import { fail } from './http.js'

export interface OwnerState { configured: boolean; revision: string; valid?: boolean; setupComplete?: boolean; assistantName?: string }

export const unifiedAuth = () => !!process.env.ADMIN_AUTH_URL

async function authority(password?: string, ip?: string): Promise<OwnerState> {
  const base = process.env.ADMIN_AUTH_URL
  const secret = process.env.ADMIN_INTERNAL_SECRET
  if (!base || !secret) throw fail('unavailable', 'Owner authentication is not configured')
  const r = await fetch(`${base}/internal/auth${password === undefined ? '' : '/verify'}`, {
    method: password === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Jarvis-Internal-Secret': secret },
    body: password === undefined ? undefined : JSON.stringify({ password, ip }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => { throw fail('unavailable', 'Owner authentication is temporarily unavailable') })
  if (r.status === 429) throw fail('rate_limited', 'Too many failed attempts')
  if (!r.ok) throw fail('unavailable', 'Owner authentication is temporarily unavailable')
  return await r.json() as OwnerState
}

/** The existing owner row becomes an epoch marker, never a second password source.
 * Updating it and invalidating all old credentials happens atomically, once per epoch.
 */
async function synchronize(state: OwnerState): Promise<OwnerState> {
  const db = await memDb.connect()
  try {
    await db.query('BEGIN')
    const changed = await db.query(
      `INSERT INTO app_owner (id, password_hash) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now()
       WHERE app_owner.password_hash IS DISTINCT FROM excluded.password_hash RETURNING id`,
      [`admin:${state.revision}`],
    )
    if (changed.rows.length) {
      await db.query('UPDATE devices SET revoked_at = now() WHERE revoked_at IS NULL')
      await db.query('UPDATE oauth_tokens SET revoked_at = now() WHERE revoked_at IS NULL')
      await db.query('DELETE FROM oauth_codes')
      await db.query('DELETE FROM pairing_codes')
    }
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  } finally { db.release() }
  return state
}

export async function ownerState(): Promise<OwnerState> { return synchronize(await authority()) }
export async function verifyOwner(password: string, ip?: string): Promise<boolean> {
  const state = await synchronize(await authority(password, ip))
  return state.configured && state.valid === true
}
