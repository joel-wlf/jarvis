import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Auth } from '../src/auth.js'
import type { Ctx } from '../src/context.js'
import { FakeDb } from '../src/db.js'
import { FakeDocker } from '../src/docker.js'
import { JobRunner } from '../src/jobs.js'
import { createApp } from '../src/server.js'

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-auth-'))

test('first owner sets a password without a setup code; later claims cannot replace it', () => {
  const folder = dir()
  const a = new Auth(folder)
  assert.match(a.setup('1.1.1.1', '', 'kurz').error!, /15 Zeichen/)
  const ok = a.setup('1.1.1.1', '', 'mein-langes-passwort')
  assert.ok(ok.session)
  assert.ok(a.check(ok.session))
  const other = new Auth(folder)
  assert.match(other.setup('2.2.2.2', '', 'anderes-langes-passwort').error!, /schon eingerichtet/)
  assert.ok(a.login('1.1.1.1', 'mein-langes-passwort').session)
  assert.ok(a.login('1.1.1.1', 'anderes-langes-passwort').error)
})

test('Sperre nach zu vielen Fehlversuchen', () => {
  const a = new Auth(dir())
  a.setup('2.2.2.2', '', 'mein-langes-passwort')
  for (let i = 0; i < 10; i++) a.login('2.2.2.2', 'falsch')
  assert.match(a.login('2.2.2.2', 'mein-langes-passwort').error!, /Fehlversuche/)
  assert.ok(a.login('3.3.3.3', 'mein-langes-passwort').session, 'andere Adressen sind nicht betroffen')
})

test('Passwort zurücksetzen macht Sitzungen ungültig', () => {
  const d = dir()
  const a = new Auth(d)
  const s = a.setup('1.1.1.1', '', 'mein-langes-passwort').session
  new Auth(d).resetPassword() // wie die CLI in einem anderen Prozess
  assert.equal(a.check(s), false)
})

test('HTTP: ohne Anmeldung kein Zugriff, ohne X-Jarvis keine schreibende Anfrage, Geheimnisse maskiert', async () => {
  const d = dir()
  const envPath = path.join(d, '.env')
  fs.writeFileSync(envPath, `MCP_TOKEN=${'c'.repeat(64)}\nPOSTGRES_PASSWORD=${'a'.repeat(48)}\nMCP_RO_PASSWORD=${'b'.repeat(48)}\nOWNER_NAME=Alex\n`)
  const docker = new FakeDocker()
  docker.defaultEnvFile = envPath
  const ctx: Ctx = {
    envPath, dataDir: d, docker, db: new FakeDb(), jobs: new JobRunner(path.join(d, 'jobs')),
    waStatusFile: path.join(d, 'link.json'), healthTimeoutMs: 1000, pollMs: 10, stableMs: 10, fake: true,
  }
  const auth = new Auth(path.join(d, 'auth'))
  const server = createApp(ctx, auth).listen(0)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    assert.equal((await fetch(`${base}/api/settings`)).status, 401)
    const noHeader = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(noHeader.status, 403)
    const foreign = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis': '1', origin: 'https://boese.example' }, body: '{}' })
    assert.equal(foreign.status, 403)

    const h = { 'content-type': 'application/json', 'x-jarvis': '1' }
    const setup = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: h, body: JSON.stringify({ code: '', password: 'mein-langes-passwort' }) })
    assert.equal(setup.status, 200)
    const cookie = setup.headers.get('set-cookie')!.split(';')[0]
    assert.match(setup.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/)

    const s = await (await fetch(`${base}/api/settings`, { headers: { cookie } })).json()
    assert.equal(s.values.OWNER_NAME, 'Alex')
    assert.equal(s.values.MCP_TOKEN, undefined)
    assert.deepEqual(s.secrets.MCP_TOKEN, { set: true, hint: '…cccc' })
    assert.ok(!JSON.stringify(s).includes('c'.repeat(20)), 'Token darf nie im Klartext an den Browser gehen')

    const reveal = await fetch(`${base}/api/reveal`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ key: 'MCP_TOKEN', password: 'falsch' }) })
    assert.equal(reveal.status, 403)
    const reveal2 = await (await fetch(`${base}/api/reveal`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ key: 'MCP_TOKEN', password: 'mein-langes-passwort' }) })).json()
    assert.equal(reveal2.value, 'c'.repeat(64))

    const logs = await (await fetch(`${base}/api/logs/mcp-server`, { headers: { cookie } })).json()
    assert.ok(!logs.text.includes('c'.repeat(20)), 'Logs werden geschwärzt')
    assert.match(logs.text, /••••/)

    const bad = await fetch(`${base}/api/apply`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ changes: { MAX_ACTIONS_PER_HOUR: 'x' } }) })
    assert.equal(bad.status, 422)
  } finally {
    server.close()
  }
})
