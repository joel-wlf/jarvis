import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { SetupStore } from '../src/setup.js'
import { Auth } from '../src/auth.js'

test('setup survives restart, rejects concurrent changes and never stores secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-setup-'))
  try {
    const store = new SetupStore(dir)
    const first = store.read()
    const account = store.save({ ...first, step: 'account', draft: { ASSISTANT_NAME: 'Alfred' } }, false)!
    assert.equal(new SetupStore(dir).read().step, 'account')
    assert.equal(store.save({ ...first, step: 'account' }, false), null)
    assert.throws(() => store.save({ ...account, draft: { OPENAI_API_KEY: 'secret' } }, false), /Ungültige/)
    assert.throws(() => store.save({ ...account, step: 'done', complete: true }, false), /vorherigen/)
    const source = store.save({ ...account, step: 'source' }, false)!
    assert.equal(source.furthest, 2)
    assert.equal(store.save({ ...source, step: 'name' }, false)!.furthest, 2)
    assert.equal(new SetupStore(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-upgrade-'))).read(true).complete, true)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('password change invalidates sessions in other admin processes and changes credential epoch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-epoch-'))
  try {
    const a = new Auth(dir)
    assert.ok(a.setup('local', '', 'a very long password').session)
    const b = new Auth(dir)
    const session = b.login('local', 'a very long password').session!
    const revision = b.revision()
    assert.equal(a.changePassword('local', 'a very long password', 'a different long password'), null)
    assert.notEqual(b.revision(), revision)
    assert.equal(b.check(session), false)
    assert.ok(b.login('local', 'a different long password').session)
    assert.ok(b.login('local', 'a very long password').error)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('pending setup task survives restart and is acknowledged without advancing the step', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-resume-'))
  try {
    const store = new SetupStore(dir)
    const account = store.save({ ...store.read(), step: 'account' }, false)!
    const source = store.save({ ...account, step: 'source', draft: { source: 'later', ASSISTANT_NAME: 'Alfred' } }, false)!
    const pending = store.save({ ...source, draft: { ...source.draft, pendingJobId: 'install-123' } }, true)!
    assert.equal(new SetupStore(dir).read(true).draft.pendingJobId, 'install-123')
    assert.equal(store.save({ ...source, step: 'name' }, true), null, 'a second tab cannot override the active task revision')
    const acknowledged = store.save({ ...pending, draft: { ...pending.draft, pendingJobId: '' } }, true)!
    assert.equal(acknowledged.step, 'source')
    assert.equal(acknowledged.draft.source, 'later')
    assert.equal(acknowledged.draft.ASSISTANT_NAME, 'Alfred')
    assert.equal(acknowledged.complete, false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
