import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from './envfile.js'

export interface RunResult {
  code: number
  out: string
}

export interface RunOptions {
  envFile?: string
  /** COMPOSE_PROFILES für diesen Aufruf (sonst aus envFile) */
  profiles?: string
  timeoutMs?: number
  onLine?: (line: string) => void
}

/** Zugriff auf Docker. Echte Umsetzung ruft die CLI auf; Tests und die Entwicklung nutzen FakeDocker. */
export interface DockerApi {
  compose(args: string[], o?: RunOptions): Promise<RunResult>
  docker(args: string[], o?: RunOptions): Promise<RunResult>
}

export interface ServiceState {
  service: string
  state: string // running | exited | restarting | created | paused | dead | missing
  health: string // healthy | unhealthy | starting | ''
  exitCode?: number
  status?: string
}

const MAX_OUT = 256 * 1024

export class CliDocker implements DockerApi {
  constructor(private projectDir: string, private defaultEnvFile: string) {}

  compose(args: string[], o: RunOptions = {}) {
    const envFile = o.envFile ?? this.defaultEnvFile
    const base = ['compose', '--project-directory', this.projectDir, '-f', path.join(this.projectDir, 'docker-compose.yml')]
    if (fs.existsSync(envFile)) base.push('--env-file', envFile)
    return this.run([...base, ...args], { ...o, envFile })
  }

  docker(args: string[], o: RunOptions = {}) {
    return this.run(args, o)
  }

  private run(args: string[], o: RunOptions): Promise<RunResult> {
    // Saubere Umgebung: Variablen des Admin-Containers dürfen die Werte aus .env nie überschreiben.
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME ?? '/root' }
    if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST
    let profiles = o.profiles
    if (profiles === undefined && o.envFile) {
      try {
        profiles = parseEnv(fs.readFileSync(o.envFile, 'utf8')).COMPOSE_PROFILES ?? ''
      } catch {
        profiles = ''
      }
    }
    env.COMPOSE_PROFILES = profiles ?? ''
    return new Promise((resolve) => {
      const child = spawn('docker', args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let partial = ''
      const onData = (b: Buffer) => {
        const s = b.toString('utf8')
        out = (out + s).slice(-MAX_OUT)
        if (o.onLine) {
          const parts = (partial + s).split(/\r?\n|\r/)
          partial = parts.pop() ?? ''
          for (const p of parts) if (p.trim()) o.onLine(p)
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      let timer: NodeJS.Timeout | undefined
      if (o.timeoutMs) {
        timer = setTimeout(() => {
          out += `\n[Zeitüberschreitung nach ${Math.round(o.timeoutMs! / 1000)} s, Abbruch]`
          child.kill('SIGTERM')
          setTimeout(() => child.kill('SIGKILL'), 10_000).unref()
        }, o.timeoutMs)
      }
      child.on('error', (e) => {
        clearTimeout(timer)
        resolve({ code: 127, out: `docker konnte nicht gestartet werden: ${e.message}` })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (partial.trim() && o.onLine) o.onLine(partial)
        resolve({ code: code ?? 1, out })
      })
    })
  }
}

/** `docker compose ps --format json` liefert je nach Version ein Array oder eine Zeile pro Container. */
export function parsePs(out: string): ServiceState[] {
  const t = out.trim()
  if (!t) return []
  let rows: any[] = []
  if (t.startsWith('[')) {
    try {
      rows = JSON.parse(t)
    } catch {
      rows = []
    }
  } else {
    for (const line of t.split('\n')) {
      try {
        rows.push(JSON.parse(line))
      } catch {
        // Warnzeilen ignorieren
      }
    }
  }
  return rows
    .filter((r) => r && r.Service)
    .map((r) => ({
      service: String(r.Service),
      state: String(r.State ?? 'unknown').toLowerCase(),
      health: String(r.Health ?? '').toLowerCase(),
      exitCode: typeof r.ExitCode === 'number' ? r.ExitCode : undefined,
      status: r.Status ? String(r.Status) : undefined,
    }))
}

export async function composePs(api: DockerApi, envFile?: string): Promise<ServiceState[]> {
  const r = await api.compose(['ps', '--all', '--format', 'json'], { envFile, timeoutMs: 30_000 })
  if (r.code !== 0) throw new Error(`docker compose ps fehlgeschlagen: ${r.out.slice(-500)}`)
  return parsePs(r.out)
}

/** Dienste, die mit den Profilen aus envFile aktiv sind. */
export async function activeServices(api: DockerApi, envFile?: string, profiles?: string): Promise<string[]> {
  const r = await api.compose(['config', '--services'], { envFile, profiles, timeoutMs: 30_000 })
  if (r.code !== 0) throw new Error(`Konfiguration ungültig: ${r.out.slice(-800)}`)
  return r.out.split('\n').map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9_-]*$/.test(s))
}

export async function validateCompose(api: DockerApi, envFile: string): Promise<string | null> {
  const r = await api.compose(['config', '-q'], { envFile, timeoutMs: 30_000 })
  return r.code === 0 ? null : r.out.trim().slice(-1500) || 'docker compose config fehlgeschlagen'
}

// ------------------------------------------------------------------------------------------------
// FakeDocker: für Tests und für die Entwicklung ohne Docker-Daemon (JARVIS_FAKE_DOCKER=1).

type FakeSvc = { state: string; health: string; config: string }

export class FakeDocker implements DockerApi {
  calls: string[][] = []
  svcs = new Map<string, FakeSvc>()
  /** Liefert für eine Umgebung die Dienste, die nach `up` abstürzen sollen. */
  failWith: (env: Record<string, string>) => string[] = (env) => (env.OWNER_NAME === 'Fehler' ? ['mcp-server'] : [])
  configError: (env: Record<string, string>) => string | null = () => null
  delayMs = 0
  volumes = new Set(['jarvis_pgdata', 'jarvis_wa-auth'])
  /** wie bei CliDocker: ohne envFile gilt die .env des Projekts */
  defaultEnvFile?: string

  static ALL = ['postgres', 'embedder', 'wa-ingest', 'mcp-server', 'admin']
  static PROFILED: Record<string, string> = { whisper: 'local-whisper', organizer: 'organizer', cloudflared: 'tunnel' }

  constructor(running = true) {
    if (running) for (const s of FakeDocker.ALL) this.svcs.set(s, { state: 'running', health: s === 'wa-ingest' || s === 'admin' ? '' : 'healthy', config: '' })
  }

  private readEnv(o: RunOptions) {
    try {
      const f = o.envFile ?? this.defaultEnvFile
      return f ? parseEnv(fs.readFileSync(f, 'utf8')) : {}
    } catch {
      return {}
    }
  }

  private active(o: RunOptions) {
    const profiles = (o.profiles ?? this.readEnv(o).COMPOSE_PROFILES ?? '').split(',').filter(Boolean)
    return [...FakeDocker.ALL, ...Object.entries(FakeDocker.PROFILED).filter(([, p]) => profiles.includes(p)).map(([s]) => s)]
  }

  async compose(args: string[], o: RunOptions = {}): Promise<RunResult> {
    this.calls.push(['compose', ...args])
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs))
    const env = this.readEnv(o)
    const [cmd, ...rest] = args
    const say = (l: string) => o.onLine?.(l)
    switch (cmd) {
      case 'config': {
        const err = this.configError(env)
        if (err) return { code: 15, out: err }
        if (rest.includes('--services')) return { code: 0, out: this.active(o).join('\n') + '\n' }
        return { code: 0, out: '' }
      }
      case 'ps':
        return {
          code: 0,
          out: [...this.svcs.entries()].map(([s, v]) => JSON.stringify({ Service: s, State: v.state, Health: v.health, Status: v.state })).join('\n'),
        }
      case 'up': {
        const names = rest.filter((a) => !a.startsWith('-'))
        const targets = names.length ? names : this.active(o).filter((s) => s !== 'admin')
        const fail = new Set(this.failWith(env))
        const sig = JSON.stringify(env)
        for (const s of targets) {
          const prev = this.svcs.get(s)
          if (prev && prev.config === sig && prev.state === 'running' && !rest.includes('--force-recreate')) continue
          say(`Container jarvis-${s}-1  Recreated`)
          this.svcs.set(s, { state: fail.has(s) ? 'restarting' : 'running', health: fail.has(s) ? '' : FakeDocker.ALL.includes(s) && s !== 'wa-ingest' ? 'healthy' : '', config: sig })
          say(`Container jarvis-${s}-1  Started`)
        }
        return { code: 0, out: '' }
      }
      case 'rm':
      case 'stop': {
        for (const s of rest.filter((a) => !a.startsWith('-'))) {
          if (cmd === 'rm') this.svcs.delete(s)
          else if (this.svcs.has(s)) this.svcs.get(s)!.state = 'exited'
          say(`Container jarvis-${s}-1  ${cmd === 'rm' ? 'Removed' : 'Stopped'}`)
        }
        return { code: 0, out: '' }
      }
      case 'restart':
        return { code: 0, out: '' }
      case 'logs':
        return { code: 0, out: `${rest.at(-1)}-1  | Beispiel-Logzeile\n${rest.at(-1)}-1  | Token: ${env.MCP_TOKEN ?? ''}\n` }
      case 'run':
        return { code: 0, out: 'Schätzung: 1.234 Nachrichten offen, ca. 0,42 $\n' }
      default:
        return { code: 0, out: '' }
    }
  }

  async docker(args: string[]): Promise<RunResult> {
    this.calls.push(args)
    if (args[0] === 'volume' && args[1] === 'inspect') return this.volumes.has(args[2]) ? { code: 0, out: '[]' } : { code: 1, out: 'no such volume' }
    if (args[0] === 'volume' && args[1] === 'rm') {
      this.volumes.delete(args.at(-1)!)
      return { code: 0, out: '' }
    }
    return { code: 0, out: '' }
  }
}
