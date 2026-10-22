// Nightly update: once a day, in the chosen hour, load new images and restart what changed (ops.startRebuild with
// auto). Owners who never open the maintenance page stay current; a failed update rolls back on its own.
import fs from 'node:fs'
import path from 'node:path'
import { readCurrent, type Ctx } from './context.js'
import { startRebuild } from './ops.js'
import { effective } from './schema.js'
import { SetupStore } from './setup.js'

export interface LastUpdate { date: string; jobId: string }

const file = (ctx: Ctx) => path.join(ctx.dataDir, 'auto-update.json')

export function readLastUpdate(ctx: Ctx): LastUpdate | null {
  try {
    return JSON.parse(fs.readFileSync(file(ctx), 'utf8')) as LastUpdate
  } catch {
    return null
  }
}

/** Calendar day in the container's time zone (TZ, Europe/Berlin in docker-compose.yml). */
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Starts the nightly update when it is due. Called every few minutes; returns the job when it started one. */
export function autoUpdateTick(ctx: Ctx, now = new Date()) {
  let env
  try {
    env = readCurrent(ctx).env
  } catch {
    return null
  }
  if (!env.POSTGRES_PASSWORD || effective(env, 'AUTO_UPDATE') !== 'true' || ctx.jobs.current()) return null
  if (now.getHours() !== Number(effective(env, 'AUTO_UPDATE_HOUR'))) return null
  if (!new SetupStore(ctx.dataDir).read(true).complete) return null
  if (readLastUpdate(ctx)?.date === day(now)) return null
  const job = startRebuild(ctx, { auto: true })
  fs.writeFileSync(file(ctx), JSON.stringify({ date: day(now), jobId: job.id } satisfies LastUpdate), { mode: 0o600 })
  return job
}
