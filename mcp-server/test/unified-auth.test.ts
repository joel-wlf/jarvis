import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { ADMIN_SECRET, auth, json, start, testDb } from './helpers.js'
import { createDevice, setOwnerPassword } from '../src/app/store.js'

test('canonical owner password, migration, URL-only pairing, device administration and reset epochs', async () => {
  const pg = await testDb()
  await setOwnerPassword('old app password')
  const old = await createDevice('Old phone', 'ios')
  let revision = 'first-admin-epoch'
  let configured = true
  let password = 'the real admin password'
  const authority = http.createServer(async (req, res) => {
    if (req.headers['x-jarvis-internal-secret'] !== ADMIN_SECRET) { res.writeHead(401).end(); return }
    let body = ''
    for await (const part of req) body += part
    const data = body ? JSON.parse(body) : {}
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ configured, revision, valid: configured && data.password === password }))
  })
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve))
  process.env.ADMIN_AUTH_URL = `http://127.0.0.1:${(authority.address() as AddressInfo).port}`
  process.env.ADMIN_INTERNAL_SECRET = ADMIN_SECRET
  const s = await start()
  const internal = (token: string) => fetch(`${s.internalUrl}/internal/device-auth`, json({ token }, { 'x-jarvis-internal-secret': ADMIN_SECRET }))
  const login = (pw: string) => fetch(`${s.url}/api/v1/login`, json({ password: pw, deviceName: 'New phone', platform: 'ios' }))
  try {
    assert.equal((await (await fetch(`${s.url}/api/v1/info`)).json()).passwordLogin, true)
    assert.equal((await internal(old.token)).status, 200)
    assert.equal((await (await internal(old.token)).json()).valid, false, 'old app sessions are revoked on migration')
    assert.equal((await login('old app password')).status, 401)
    const response = await login(password)
    assert.equal(response.status, 201)
    const device = await response.json()
    assert.equal((await (await internal(device.token)).json()).valid, true)
    assert.equal((await (await internal('legacy-mcp-token')).json()).valid, false)
    assert.equal((await (await internal('jat_oauth-token')).json()).valid, false)
    assert.equal((await fetch(`${s.url}/api/v1/pair`, json({ code: 'ABCD-EFGH', deviceName: 'Bypass', platform: 'ios' }))).status, 403)
    assert.equal((await fetch(`${s.url}/internal/auth`)).status, 404)
    assert.equal((await fetch(`${s.url}/api/v1/devices`, { headers: auth(device.token) })).status, 200)
    // OAuth grants and outstanding authorization codes also belong to the password epoch.
    await pg.query(`INSERT INTO oauth_clients (client_id, metadata) VALUES ('client', '{}')`)
    await pg.query(`INSERT INTO oauth_tokens (client_id, access_hash, scopes, access_expires_at) VALUES ('client','old-access','{}',now() + interval '1 hour')`)
    revision = 'changed-admin-epoch'
    password = 'the changed admin password'
    assert.equal((await (await internal(device.token)).json()).valid, false)
    assert.equal((await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM oauth_tokens WHERE revoked_at IS NULL`)).rows[0].n, 0)
    assert.equal((await login('the real admin password')).status, 401)
    const fresh = await (await login(password)).json()
    assert.equal((await (await internal(fresh.token)).json()).valid, true)
    configured = false; revision = 'unconfigured'
    assert.equal((await (await internal(fresh.token)).json()).valid, false)
    assert.equal((await login(password)).status, 401)
  } finally {
    delete process.env.ADMIN_AUTH_URL
    delete process.env.ADMIN_INTERNAL_SECRET
    await s.close()
    authority.closeAllConnections()
    await new Promise((resolve) => authority.close(resolve))
    await pg.close()
  }
})
