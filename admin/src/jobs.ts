import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type JobStatus = 'running' | 'ok' | 'failed' | 'rolled_back' | 'interrupted'
export type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'out'

export interface Job {
  id: string
  kind: string
  title: string
  status: JobStatus
  startedAt: string
  endedAt?: string
  lines: { t: string; level: LogLevel; msg: string }[]
  result?: Record<string, unknown>
}

export interface JobLog {
  (level: LogLevel, msg: string): void
}

export class BusyError extends Error {
  constructor(public job: Job) {
    super(`Es läuft bereits ein Vorgang: ${job.title}`)
  }
}

const MAX_LINES = 2000
const KEEP_JOBS = 50

/** Genau ein Vorgang gleichzeitig. Protokolle liegen als Datei vor und überleben einen Neustart der Oberfläche. */
export class JobRunner {
  private jobs = new Map<string, Job>()
  private running: Job | null = null
  private saveTimers = new Map<string, NodeJS.Timeout>()

  constructor(private dir: string, private redact: (s: string) => string = (s) => s) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Job
        if (j.status === 'running') {
          j.status = 'interrupted'
          j.endedAt = new Date().toISOString()
          j.lines.push({ t: j.endedAt, level: 'error', msg: 'Die Oberfläche wurde während des Vorgangs neu gestartet. Bitte den Zustand unter Übersicht prüfen.' })
          this.persist(j)
        }
        this.jobs.set(j.id, j)
      } catch {
        // kaputte Datei überspringen
      }
    }
  }

  current() {
    return this.running
  }

  get(id: string) {
    return this.jobs.get(id)
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, KEEP_JOBS)
  }

  /** Startet einen Vorgang im Hintergrund. fn gibt den Endstatus zurück; Ausnahmen gelten als "failed". */
  start(kind: string, title: string, fn: (log: JobLog, job: Job) => Promise<JobStatus | { status: JobStatus; result?: Record<string, unknown> }>): Job {
    if (this.running) throw new BusyError(this.running)
    const job: Job = {
      id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
      kind,
      title,
      status: 'running',
      startedAt: new Date().toISOString(),
      lines: [],
    }
    this.running = job
    this.jobs.set(job.id, job)
    const log: JobLog = (level, msg) => {
      for (const part of this.redact(String(msg)).split('\n')) {
        if (!part.trim() && level === 'out') continue
        job.lines.push({ t: new Date().toISOString(), level, msg: part.slice(0, 2000) })
      }
      if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES)
      this.persistSoon(job)
    }
    this.persist(job)
    void (async () => {
      try {
        const r = await fn(log, job)
        const s = typeof r === 'string' ? { status: r } : r
        job.status = s.status
        if (s.result) job.result = s.result
      } catch (e) {
        log('error', (e as Error).message || String(e))
        job.status = 'failed'
      } finally {
        job.endedAt = new Date().toISOString()
        this.running = null
        this.persist(job)
        this.prune()
      }
    })()
    return job
  }

  /** Wartet auf das Ende eines Vorgangs (für Tests und Ketten). */
  async wait(id: string, timeoutMs = 60_000): Promise<Job> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const j = this.jobs.get(id)
      if (j && j.status !== 'running') return j
      if (Date.now() > end) throw new Error('Zeitüberschreitung beim Warten auf den Vorgang')
      await new Promise((r) => setTimeout(r, 20))
    }
  }

  private persistSoon(job: Job) {
    if (this.saveTimers.has(job.id)) return
    this.saveTimers.set(
      job.id,
      setTimeout(() => {
        this.saveTimers.delete(job.id)
        this.persist(job)
      }, 500),
    )
  }

  private persist(job: Job) {
    clearTimeout(this.saveTimers.get(job.id))
    this.saveTimers.delete(job.id)
    try {
      const file = path.join(this.dir, `${job.id}.json`)
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(job), { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch {
      // Protokoll ist Komfort; der Vorgang selbst läuft weiter
    }
  }

  private prune() {
    const all = [...this.jobs.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    for (const j of all.slice(KEEP_JOBS)) {
      this.jobs.delete(j.id)
      fs.rmSync(path.join(this.dir, `${j.id}.json`), { force: true })
    }
  }
}
