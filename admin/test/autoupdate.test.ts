import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { autoUpdateTick, readLastUpdate } from '../src/autoupdate.js'
import type { Ctx } from '../src/context.js'
import { FakeDb } from '../src/db.js'
import { FakeDocker } from '../src/docker.js'
import { serializeEnv } from '../src/envfile.js'
import { JobRunner } from '../src/jobs.js'

const base = { POSTGRES_PASSWORD: 'a'.repeat(48), MCP_RO_PASSWORD: 'b'.repeat(48), MCP_TOKEN: 'c'.repeat(64), TRANSCRIBE_PROVIDER: 'off' }

function setup(env: Record<string, string> = base, complete = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-update-'))
  const envPath = path.join(dir, '.env')
  fs.writeFileSync(envPath, serializeEnv(env), { mode: 0o600 })
  fs.writeFileSync(path.join(dir, 'setup.json'), JSON.stringify({ revision: 1, step: complete ? 'done' : 'settings', furthest: complete ? 6 : 4, complete, draft: {} }))
  const docker = new FakeDocker(true)
  docker.defaultEnvFile = envPath
  const ctx: Ctx = { envPath, dataDir: dir, docker, db: new FakeDb(), jobs: new JobRunner(path.join(dir, 'jobs')), waStatusFile: path.join(dir, 'link.json'), healthTimeoutMs: 2_000, pollMs: 10, stableMs: 30, fake: true }
  return { ctx, docker }
}
const at = (hour: number) => new Date(2026, 9, 22, hour, 3)

test('runs once in the chosen hour, then waits for the next day', async () => {
  const { ctx } = setup()
  assert.equal(autoUpdateTick(ctx, at(3)), null)
  const job = autoUpdateTick(ctx, at(4))
  assert.ok(job)
  await ctx.jobs.wait(job.id)
  assert.equal(autoUpdateTick(ctx, at(4)), null)
  assert.equal(readLastUpdate(ctx)?.jobId, job.id)
  assert.ok(autoUpdateTick(ctx, new Date(2026, 9, 23, 4, 1)))
})

test('stays off when switched off or while the setup is not finished', () => {
  assert.equal(autoUpdateTick(setup({ ...base, AUTO_UPDATE: 'false' }).ctx, at(4)), null)
  assert.equal(autoUpdateTick(setup(base, false).ctx, at(4)), null)
})

test('nothing new: no service is restarted', async () => {
  const { ctx, docker } = setup()
  const job = autoUpdateTick(ctx, at(4))!
  const done = await ctx.jobs.wait(job.id)
  assert.equal(done.status, 'ok')
  assert.deepEqual(done.result, { updated: [] })
  assert.ok(!docker.calls.some((c) => c[0] === 'compose' && c[1] === 'up'))
})

test('a new image restarts the services; an unreachable registry never falls back to building', async () => {
  const { ctx, docker } = setup()
  docker.newImages.add('embedder')
  const done = await ctx.jobs.wait(autoUpdateTick(ctx, at(4))!.id)
  assert.equal(done.status, 'ok')
  assert.ok(done.lines.some((l) => l.msg.includes('embedder')))

  const offline = setup()
  offline.docker.pullFails = true
  const failed = await offline.ctx.jobs.wait(autoUpdateTick(offline.ctx, at(4))!.id)
  assert.equal(failed.status, 'failed')
  assert.ok(!offline.docker.calls.some((c) => c[1] === 'build'))
})
