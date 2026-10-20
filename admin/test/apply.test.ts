import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { backupDir, readCurrent, type Ctx } from '../src/context.js'
import { FakeDb } from '../src/db.js'
import { FakeDocker } from '../src/docker.js'
import { listBackups, serializeEnv } from '../src/envfile.js'
import { BusyError, JobRunner } from '../src/jobs.js'
import { startApply, startRelink, startRestore, startRotate } from '../src/ops.js'

const base = { POSTGRES_PASSWORD: 'a'.repeat(48), MCP_RO_PASSWORD: 'b'.repeat(48), MCP_TOKEN: 'c'.repeat(64), TRANSCRIBE_PROVIDER: 'off' }

function setup(env?: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-apply-'))
  const envPath = path.join(dir, '.env')
  if (env) fs.writeFileSync(envPath, serializeEnv(env), { mode: 0o600 })
  const docker = new FakeDocker(!!env)
  docker.defaultEnvFile = envPath
  const db = new FakeDb()
  const ctx: Ctx = {
    envPath,
    dataDir: dir,
    docker,
    db,
    jobs: new JobRunner(path.join(dir, 'jobs')),
    waStatusFile: path.join(dir, 'link.json'),
    healthTimeoutMs: 2_000,
    pollMs: 10,
    stableMs: 30,
    fake: true,
  }
  return { ctx, docker, db, dir }
}

async function run(ctx: Ctx, r: { job?: { id: string } }) {
  assert.ok(r.job, 'Vorgang wurde nicht gestartet')
  return ctx.jobs.wait(r.job.id)
}

test('Ersteinrichtung: .env wird angelegt, Dienste starten', async () => {
  const { ctx, docker } = setup()
  const job = await run(ctx, startApply(ctx, { OWNER_NAME: 'Alex', TRANSCRIBE_PROVIDER: 'off' }, { initial: true }))
  assert.equal(job.status, 'ok', job.lines.map((l) => l.msg).join('\n'))
  const { env } = readCurrent(ctx)
  assert.equal(env.OWNER_NAME, 'Alex')
  assert.match(env.MCP_TOKEN, /^[0-9a-f]{64}$/)
  assert.equal(docker.svcs.get('mcp-server')?.state, 'running')
  assert.ok(!docker.calls.some((c) => c.includes('admin') && c[1] === 'up'), 'admin darf sich nicht selbst neu starten')
})

test('ungültige Änderung: nichts wird geschrieben, kein Vorgang', async () => {
  const { ctx } = setup(base)
  const before = fs.readFileSync(ctx.envPath, 'utf8')
  const r = startApply(ctx, { MAX_ACTIONS_PER_HOUR: '-5', ORGANIZER_ENABLED: 'true' })
  assert.equal(r.job, undefined)
  assert.ok(r.prepared.errors.MAX_ACTIONS_PER_HOUR)
  assert.ok(r.prepared.checks.some((c) => c.level === 'error'))
  assert.equal(fs.readFileSync(ctx.envPath, 'utf8'), before)
})

test('Compose lehnt ab: .env bleibt unverändert', async () => {
  const { ctx, docker } = setup(base)
  docker.configError = (env) => (env.MAX_ACTIONS_PER_HOUR === '42' ? 'yaml: kaputt' : null)
  const before = fs.readFileSync(ctx.envPath, 'utf8')
  const job = await run(ctx, startApply(ctx, { MAX_ACTIONS_PER_HOUR: '42' }))
  assert.equal(job.status, 'failed')
  assert.equal(fs.readFileSync(ctx.envPath, 'utf8'), before)
  assert.ok(!docker.calls.some((c) => c[1] === 'up'))
})

test('Dienst stürzt nach der Änderung ab: automatischer Rollback', async () => {
  const { ctx, docker } = setup({ ...base, OWNER_NAME: 'Alex' })
  const before = fs.readFileSync(ctx.envPath, 'utf8')
  const job = await run(ctx, startApply(ctx, { OWNER_NAME: 'Fehler' }))
  assert.equal(job.status, 'rolled_back', job.lines.map((l) => l.msg).join('\n'))
  assert.equal(fs.readFileSync(ctx.envPath, 'utf8'), before)
  assert.equal(docker.svcs.get('mcp-server')?.state, 'running')
  assert.equal(docker.calls.filter((c) => c[1] === 'up').length, 2)
  assert.equal(listBackups(backupDir(ctx)).length, 1)
})

test('schon vorher kaputter Dienst löst keinen Rollback aus', async () => {
  const { ctx, docker } = setup({ ...base })
  docker.svcs.get('mcp-server')!.state = 'restarting'
  docker.failWith = () => ['mcp-server']
  const job = await run(ctx, startApply(ctx, { MAX_ACTIONS_PER_HOUR: '20' }))
  assert.equal(job.status, 'ok', job.lines.map((l) => l.msg).join('\n'))
  assert.equal(readCurrent(ctx).env.MAX_ACTIONS_PER_HOUR, '20')
})

test('Datenbank-Anmeldung schlägt fehl: Rollback', async () => {
  const { ctx, db } = setup({ ...base })
  db.loginError = 'Anmeldung als jarvis fehlgeschlagen: password authentication failed'
  const job = await run(ctx, startApply(ctx, { MAX_ACTIONS_PER_HOUR: '20' }))
  assert.equal(job.status, 'rolled_back')
  assert.equal(readCurrent(ctx).env.MAX_ACTIONS_PER_HOUR, undefined)
})

test('Profil-Dienste werden beim Abschalten entfernt', async () => {
  const { ctx, docker } = setup({ ...base, OPENAI_API_KEY: 'sk-' + 'x'.repeat(30), ORGANIZER_ENABLED: 'true', COMPOSE_PROFILES: 'organizer' })
  docker.svcs.set('organizer', { state: 'running', health: '', config: '' })
  const job = await run(ctx, startApply(ctx, { ORGANIZER_ENABLED: 'false' }))
  assert.equal(job.status, 'ok', job.lines.map((l) => l.msg).join('\n'))
  assert.equal(docker.svcs.has('organizer'), false)
  assert.equal(readCurrent(ctx).env.COMPOSE_PROFILES, undefined)
})

test('nur ein Vorgang gleichzeitig', async () => {
  const { ctx, docker } = setup({ ...base })
  docker.delayMs = 30
  const a = startApply(ctx, { MAX_ACTIONS_PER_HOUR: '21' })
  assert.throws(() => startApply(ctx, { MAX_ACTIONS_PER_HOUR: '22' }), BusyError)
  await run(ctx, a)
})

test('Datenbank-Passwort wechseln stellt die Datenbank um und bei Fehler zurück', async () => {
  const { ctx, db, docker } = setup({ ...base })
  db.passwords.set('jarvis', base.POSTGRES_PASSWORD)
  const ok = await run(ctx, { job: startRotate(ctx, 'POSTGRES_PASSWORD') })
  assert.equal(ok.status, 'ok', ok.lines.map((l) => l.msg).join('\n'))
  const pw = readCurrent(ctx).env.POSTGRES_PASSWORD
  assert.notEqual(pw, base.POSTGRES_PASSWORD)
  assert.equal(db.passwords.get('jarvis'), pw)

  docker.failWith = () => ['embedder']
  const bad = await run(ctx, { job: startRotate(ctx, 'POSTGRES_PASSWORD') })
  assert.equal(bad.status, 'rolled_back')
  assert.equal(readCurrent(ctx).env.POSTGRES_PASSWORD, pw)
  assert.equal(db.passwords.get('jarvis'), pw)
})

test('Sicherung mit anderen Datenbank-Passwörtern wird nicht wiederhergestellt', async () => {
  const { ctx } = setup({ ...base })
  await run(ctx, { job: startRotate(ctx, 'MCP_RO_PASSWORD') })
  const [backup] = listBackups(backupDir(ctx))
  assert.throws(() => startRestore(ctx, backup.name), /Datenbank-Passwörter/)
})

test('Neu verknüpfen löscht nur die WhatsApp-Sitzung', async () => {
  const { ctx, docker } = setup({ ...base })
  const job = await run(ctx, { job: startRelink(ctx, '+49 151 12345678') })
  assert.equal(job.status, 'ok', job.lines.map((l) => l.msg).join('\n'))
  assert.ok(!docker.volumes.has('jarvis_wa-auth'))
  assert.ok(docker.volumes.has('jarvis_pgdata'))
  assert.equal(readCurrent(ctx).env.WA_PAIRING_PHONE, '4915112345678')
})
