import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Auth } from '../src/auth.js'
import type { Ctx } from '../src/context.js'
import { FakeDb } from '../src/db.js'
import { FakeDocker } from '../src/docker.js'
import { JobRunner } from '../src/jobs.js'

// A stand-in for mcp-server: records what reaches it and streams SSE
const seen: { url: string; secret?: string; auth?: string }[] = []
const upstream = http.createServer((req, res) => {
  seen.push({ url: req.url ?? '', secret: req.headers['x-jarvis-internal-secret'] as string | undefined, auth: req.headers.authorization })
  if (req.url === '/api/v1/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"type":"health","ok":true}\n\n')
    return void res.end()
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ path: req.url }))
}).listen(0)
const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
process.env.APP_API_URL = upstreamUrl
process.env.ADMIN_WEB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-web-'))
fs.writeFileSync(path.join(process.env.ADMIN_WEB_DIR, 'index.html'), '<!doctype html><title>web</title>')
const { createApp } = await import('../src/server.js')

function start() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-bridge-'))
  const envPath = path.join(d, '.env')
  fs.writeFileSync(envPath, `MCP_TOKEN=${'c'.repeat(64)}\nPOSTGRES_PASSWORD=${'a'.repeat(48)}\nMCP_RO_PASSWORD=${'b'.repeat(48)}\n`)
  const docker = new FakeDocker()
  docker.defaultEnvFile = envPath
  const ctx: Ctx = {
    envPath, dataDir: d, docker, db: new FakeDb(), jobs: new JobRunner(path.join(d, 'jobs')),
    waStatusFile: path.join(d, 'link.json'), healthTimeoutMs: 1000, pollMs: 10, stableMs: 10, fake: true,
  }
  const auth = new Auth(path.join(d, 'auth'))
  const server = createApp(ctx, auth).listen(0)
  return { auth, server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

test('app API and OAuth paths are proxied to mcp-server, admin paths are not', async (t) => {
  const { server, base } = start()
  t.after(() => server.close())
  const r = await fetch(`${base}/api/v1/home`, { headers: { authorization: 'Bearer jd_x', 'x-jarvis-internal-secret': 'stolen' } })
  assert.deepEqual(await r.json(), { path: '/api/v1/home' })
  const last = seen.at(-1)!
  assert.equal(last.auth, 'Bearer jd_x', 'bearer token is forwarded')
  assert.equal(last.secret, undefined, 'internal secret header is stripped')

  for (const p of ['/.well-known/oauth-authorization-server', '/authorize?client_id=x', '/token', '/register']) {
    assert.deepEqual(await (await fetch(base + p, { method: p === '/token' || p === '/register' ? 'POST' : 'GET' })).json(), { path: p })
  }
  // admin API stays local, the web app is served for unknown paths
  assert.equal((await fetch(`${base}/api/settings`)).status, 401)
  assert.match(await (await fetch(`${base}/people`)).text(), /<title>web<\/title>/)
})

test('SSE streams through the proxy', async (t) => {
  const { server, base } = start()
  t.after(() => server.close())
  const r = await fetch(`${base}/api/v1/events`)
  assert.equal(r.headers.get('content-type'), 'text/event-stream')
  assert.match(await r.text(), /"type":"health"/)
})

test('pairing needs a login and returns a QR code', async (t) => {
  const { auth, server, base } = start()
  t.after(() => server.close())
  const h = { 'content-type': 'application/json', 'x-jarvis': '1' }
  assert.equal((await fetch(`${base}/api/pairing`, { method: 'POST', headers: h })).status, 401)
  const setup = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: h, body: JSON.stringify({ code: '', password: 'langes-passwort' }) })
  const cookie = setup.headers.get('set-cookie')!.split(';')[0]
  const p = await (await fetch(`${base}/api/pairing`, { method: 'POST', headers: { ...h, cookie } })).json()
  assert.match(p.qr, /^jarvis:\{/)
  assert.match(p.qrSvg, /^<svg/)
  assert.equal(p.payload.homeUrl, base)

  const weak = await fetch(`${base}/api/owner-password`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ password: 'langes-passwort', newPassword: 'kurz' }) })
  assert.equal(weak.status, 400)
  const wrongAdmin = await fetch(`${base}/api/owner-password`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ password: 'falsch', newPassword: 'ein-langes-passwort' }) })
  assert.equal(wrongAdmin.status, 403)
  const ok = await fetch(`${base}/api/owner-password`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ password: 'langes-passwort', newPassword: 'ein-langes-passwort' }) })
  assert.equal(ok.status, 200)
})

test.after(() => upstream.close())
