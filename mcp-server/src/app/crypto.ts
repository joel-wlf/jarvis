import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, key) => (e ? reject(e) : resolve(key))))

/** Random bearer secret with a readable prefix ("jd_" device, "jat_" access, "jrt_" refresh, "jac_" auth code). */
export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`
}

/** Tokens and codes are stored only as sha256 hashes. */
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

const N = 16384
const R = 8
const P = 1

/** scrypt$N$r$p$salt$hash, both base64. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, 32, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Pairing codes: 8 characters without look-alikes (no 0/O, 1/I/L), shown as "ABCD-EFGH".
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function pairingCode(): string {
  const b = randomBytes(8)
  const s = [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

export function normalizePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
