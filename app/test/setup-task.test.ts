import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previousSetupStep, setupTaskFailure, setupTaskProgress, setupTaskStage } from '../src/api/setup-task'
import type { Job } from '../src/api/admin'

const job = (status: Job['status'], messages: string[] = []): Job => ({ id: 'setup', kind: 'setup', title: 'internal', status, startedAt: new Date().toISOString(), lines: messages.map((msg) => ({ t: '', level: 'error', msg })) })

test('setup recovery never exposes raw infrastructure errors or credentials', () => {
  const message = setupTaskFailure(job('failed', ['docker failed: password=secret; POSTGRES_PASSWORD=secret']))
  assert.doesNotMatch(JSON.stringify(message), /docker|secret|POSTGRES/)
  assert.equal(message.message, 'wizard.fail.other.message')
  assert.equal(setupTaskFailure(job('interrupted')).message, 'wizard.fail.interrupted.message')
  assert.equal(setupTaskFailure(job('rolled_back')).message, 'wizard.fail.rolledBack.message')
  assert.equal(setupTaskFailure(job('failed', ['ENOSPC'])).title, 'wizard.fail.space.title')
  assert.equal(setupTaskFailure(job('failed', ['EAI_AGAIN'])).message, 'wizard.fail.download.message')
})

test('the setup bar moves with pulled and started services and never passes the next stage', () => {
  const start = Date.now()
  const at = (s: number) => new Date(start + s * 1000).toISOString()
  const value: Job = { ...job('running'), startedAt: at(0), lines: [
    { t: at(1), level: 'info', msg: 'Starte Dienste: postgres, embedder' },
  ] }
  const empty = setupTaskProgress(value, start + 2000)
  assert.equal(empty.stage, 1)
  value.lines!.push({ t: at(5), level: 'out', msg: ' ✔ postgres Pulled' }, { t: at(6), level: 'out', msg: ' Container jarvis-postgres-1  Started' })
  const half = setupTaskProgress(value, start + 7000)
  assert.ok(half.fraction > empty.fraction)
  assert.equal(half.service, 'postgres')
  // hours later without a signal it still stays below the waiting stage
  assert.ok(setupTaskProgress(value, start + 5 * 3600_000).fraction <= 0.72)
  value.lines!.push({ t: at(9), level: 'info', msg: 'Warte, bis alle Dienste stabil laufen …' }, { t: at(9), level: 'info', msg: 'Warte auf: embedder (starting)' })
  const waiting = setupTaskProgress(value, start + 10_000)
  assert.equal(waiting.stage, 2)
  assert.ok(waiting.fraction >= 0.72 && waiting.fraction < 0.93)
  assert.equal(setupTaskProgress({ ...value, status: 'ok' }).fraction, 1)
})

test('setup progress follows confirmed stages, not noisy container output', () => {
  const value = job('running')
  value.lines = [
    { t: '', level: 'info', msg: 'Starte Dienste: postgres' },
    { t: '', level: 'out', msg: 'Prüfe die Datenbank-Anmeldungen …' },
  ]
  assert.equal(setupTaskStage(value), 1)
  value.lines.push({ t: '', level: 'info', msg: 'Warte, bis alle Dienste stabil laufen …' })
  assert.equal(setupTaskStage(value), 2)
  value.lines.push({ t: '', level: 'info', msg: 'Prüfe die Datenbank-Anmeldungen …' })
  assert.equal(setupTaskStage(value), 3)
})

test('back navigation skips an integration the owner chose to connect later', () => {
  assert.equal(previousSetupStep('settings', 'later'), 'source')
  assert.equal(previousSetupStep('settings', 'whatsapp'), 'whatsapp')
  assert.equal(previousSetupStep('account', 'later'), 'name')
  assert.equal(previousSetupStep('name', 'later'), 'name')
})
