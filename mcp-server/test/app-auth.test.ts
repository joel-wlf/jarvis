import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import { ADMIN_SECRET, auth, json, start, testDb, type Running } from './helpers.js'

let pg: PGlite
let s: Running

before(async () => {
  pg = await testDb()
  s = await start()
})
after(async () => {
  await s.close()
  await pg.close()
})

const internal = (path: string, init: RequestInit = {}, secret = ADMIN_SECRET) =>
  fetch(`${s.internalUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'x-jarvis-internal-secret': secret, ...(init.headers ?? {}) } })

test('info works without auth and reports password login', async () => {
  const before = await (await fetch(`${s.url}/api/v1/info`)).json()
  assert.equal(before.name, 'jarvis')
  assert.equal(before.apiVersion, 1)
  assert.equal(before.passwordLogin, false)
  assert.equal(before.oauthMetadata, `${s.url}/.well-known/oauth-authorization-server`)
  assert.equal((await internal('/internal/owner-password', { method: 'PUT', body: JSON.stringify({ password: 'short' }) })).status, 400)
  assert.equal((await internal('/internal/owner-password', { method: 'PUT', body: JSON.stringify({ password: 'a long enough password' }) })).status, 204)
  assert.equal((await (await fetch(`${s.url}/api/v1/info`)).json()).passwordLogin, true)
})

test('internal API needs the secret and refuses tunnel traffic; it is not on the public app', async () => {
  assert.equal((await internal('/internal/pairing-codes', { method: 'POST' }, 'wrong')).status, 401)
  assert.equal((await internal('/internal/pairing-codes', { method: 'POST', headers: { 'cf-connecting-ip': '1.2.3.4' } })).status, 403)
  assert.equal((await fetch(`${s.url}/internal/pairing-codes`, json({}, { 'x-jarvis-internal-secret': ADMIN_SECRET }))).status, 404)
})

test('pairing: code -> device token, single use, devices list, revoke', async () => {
  const created = await internal('/internal/pairing-codes', { method: 'POST', body: JSON.stringify({ homeUrl: 'http://192.168.1.20:8080' }) })
  assert.equal(created.status, 201)
  const { code, payload, qr } = await created.json()
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.deepEqual(payload, { v: 1, url: s.url, homeUrl: 'http://192.168.1.20:8080', code })
  assert.ok(qr.startsWith('jarvis:{'))

  const bad = await fetch(`${s.url}/api/v1/pair`, json({ code, deviceName: 'Phone', platform: 'symbian' }))
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'invalid')

  const pair = await fetch(`${s.url}/api/v1/pair`, json({ code: code.toLowerCase().replace('-', ' '), deviceName: 'Phone', platform: 'ios' }))
  assert.equal(pair.status, 201)
  const a = await pair.json()
  assert.match(a.token, /^jd_/)
  const reuse = await fetch(`${s.url}/api/v1/pair`, json({ code, deviceName: 'Other', platform: 'android' }))
  assert.equal(reuse.status, 401)
  assert.equal((await reuse.json()).error.code, 'unauthorized')

  const login = await fetch(`${s.url}/api/v1/login`, json({ password: 'a long enough password', deviceName: 'Laptop', platform: 'web' }))
  assert.equal(login.status, 201)
  const b = await login.json()

  const list = await (await fetch(`${s.url}/api/v1/devices`, { headers: auth(a.token) })).json()
  const byId = new Map(list.devices.map((d: any) => [d.id, d]))
  assert.equal((byId.get(a.deviceId) as any).current, true)
  assert.equal((byId.get(a.deviceId) as any).platform, 'ios')
  assert.equal((byId.get(b.deviceId) as any).current, undefined)

  // the laptop revokes the phone
  assert.equal((await fetch(`${s.url}/api/v1/devices/${a.deviceId}`, { method: 'DELETE', headers: auth(b.token) })).status, 204)
  const gone = await fetch(`${s.url}/api/v1/devices`, { headers: auth(a.token) })
  assert.equal(gone.status, 401)
  assert.equal((await gone.json()).error.code, 'unauthorized')
  assert.equal((await fetch(`${s.url}/api/v1/devices/${a.deviceId}`, { method: 'DELETE', headers: auth(b.token) })).status, 404)
  assert.equal((await fetch(`${s.url}/api/v1/home`)).status, 401)
})

test('pairing codes expire', async () => {
  const { code } = await (await internal('/internal/pairing-codes', { method: 'POST' })).json()
  await pg.query(`UPDATE pairing_codes SET expires_at = now() - interval '1 second'`)
  assert.equal((await fetch(`${s.url}/api/v1/pair`, json({ code, deviceName: 'Late', platform: 'web' }))).status, 401)
})

test('rate limit: after 10 wrong passwords even the right one gets 429; other IPs are not affected', async () => {
  const fresh = await start()
  try {
    const ip = { 'cf-connecting-ip': '203.0.113.7' }
    for (let i = 0; i < 9; i++) assert.equal((await fetch(`${fresh.url}/api/v1/login`, json({ password: `wrong-${i}`, deviceName: 'x', platform: 'web' }, ip))).status, 401)
    const tenth = await fetch(`${fresh.url}/api/v1/login`, json({ password: 'wrong-10', deviceName: 'x', platform: 'web' }, ip))
    assert.equal(tenth.status, 429)
    const right = await fetch(`${fresh.url}/api/v1/login`, json({ password: 'a long enough password', deviceName: 'x', platform: 'web' }, ip))
    assert.equal(right.status, 429)
    assert.equal((await right.json()).error.code, 'rate_limited')
    const other = await fetch(`${fresh.url}/api/v1/login`, json({ password: 'a long enough password', deviceName: 'x', platform: 'web' }, { 'cf-connecting-ip': '203.0.113.8' }))
    assert.equal(other.status, 201)

    // wrong bearer tokens on /api/v1 and /mcp are limited too, valid ones never
    const tip = { 'cf-connecting-ip': '198.51.100.1' }
    for (let i = 0; i < 10; i++) assert.equal((await fetch(`${fresh.url}/api/v1/home`, { headers: { ...tip, ...auth(`jd_wrong${i}`) } })).status, 401)
    assert.equal((await fetch(`${fresh.url}/api/v1/home`, { headers: { ...tip, ...auth('jd_wrong') } })).status, 429)
    const { token } = await other.json()
    assert.equal((await fetch(`${fresh.url}/api/v1/devices`, { headers: { ...tip, ...auth(token) } })).status, 200)
    for (let i = 0; i < 10; i++) await fetch(`${fresh.url}/t/wrong${i}/mcp`, json({}, tip))
    assert.equal((await fetch(`${fresh.url}/t/wrong/mcp`, json({}, tip))).status, 429)
  } finally {
    await fresh.close()
  }
})
