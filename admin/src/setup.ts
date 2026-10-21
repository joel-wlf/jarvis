import fs from 'node:fs'
import path from 'node:path'
import { ApplyError } from './apply.js'

export const STEPS = ['name', 'account', 'source', 'whatsapp', 'settings', 'remote', 'done'] as const
export interface SetupProgress {
  revision: number
  step: typeof STEPS[number]
  furthest: number
  complete: boolean
  draft: Record<string, string>
}
const SAFE_KEYS = new Set(['ASSISTANT_NAME', 'OWNER_NAME', 'ORGANIZER_EXCLUDE_NAMES', 'source', 'remote', 'APP_PUBLIC_URL', 'pendingJobId'])

/** Non-secret wizard state; settings/secrets are committed through the normal apply transaction. */
export class SetupStore {
  private file: string
  constructor(dir: string) { this.file = path.join(dir, 'setup.json') }
  read(initialized = false): SetupProgress {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) as SetupProgress }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      return { revision: 0, step: 'name', furthest: 0, complete: initialized, draft: {} }
    }
  }
  save(input: SetupProgress, initialized: boolean): SetupProgress | null {
    const current = this.read(initialized)
    if (input.revision !== current.revision) return null
    const index = STEPS.indexOf(input.step)
    if (index < 0 || index > current.furthest + 1) throw new ApplyError('Bitte zuerst den vorherigen Schritt abschließen.')
    if (input.complete && (!initialized || input.step !== 'done')) throw new ApplyError('Die Basisdienste müssen zuerst eingerichtet werden.')
    const draft: Record<string, string> = {}
    for (const [k, v] of Object.entries(input.draft ?? {})) {
      if (!SAFE_KEYS.has(k) || typeof v !== 'string' || v.length > 2000) throw new ApplyError('Ungültige Einrichtungseingabe.')
      draft[k] = v
    }
    const next: SetupProgress = { revision: current.revision + 1, step: input.step, furthest: Math.max(current.furthest, index), complete: current.complete || !!input.complete, draft }
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
    return next
  }
}
