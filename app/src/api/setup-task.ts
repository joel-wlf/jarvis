import type { Job, SetupProgress } from './admin'

/** Translate internal events into a small, stable vocabulary for first-time owners. */
export function setupTaskStage(job: Job) {
  let stage = 0
  for (const line of job.lines ?? []) {
    if (line.level === 'out') continue
    if (line.msg.startsWith('Starte Dienste:')) stage = Math.max(stage, 1)
    if (line.msg.startsWith('Warte, bis alle Dienste')) stage = Math.max(stage, 2)
    if (line.msg.startsWith('Prüfe die Datenbank-Anmeldungen')) stage = Math.max(stage, 3)
  }
  return stage
}

/** Share of the bar each stage owns: check, download and start, wait until healthy, final check. */
const SPAN: [number, number][] = [[0, 0.06], [0.06, 0.72], [0.72, 0.93], [0.93, 0.99]]

/**
 * How far the setup job is, 0 to 1, plus the service it is working on. Counts services that Docker Compose reports as
 * pulled, created or started, and the ones still awaited; between those signals the bar creeps on slowly so it never
 * looks frozen, but it never passes the next confirmed stage.
 */
export function setupTaskProgress(job: Job, now = Date.now()): { fraction: number; stage: number; service?: string } {
  if (job.status === 'ok') return { fraction: 1, stage: 3 }
  const lines = job.lines ?? []
  const stage = setupTaskStage(job)
  let services: string[] = []
  const pulled = new Set<string>()
  const started = new Set<string>()
  let waiting: string[] | null = null
  let service: string | undefined
  let stageAt = Date.parse(job.startedAt)
  for (const l of lines) {
    const t = Date.parse(l.t)
    if (l.level !== 'out' && /^(Starte Dienste:|Warte, bis alle Dienste|Prüfe die Datenbank-Anmeldungen)/.test(l.msg) && Number.isFinite(t)) stageAt = t
    const start = /^Starte (?:Dienste|vorherigen Stand): ([^(]+)/.exec(l.msg)
    if (l.level !== 'out' && start) services = start[1]!.split(',').map((x) => x.trim()).filter(Boolean)
    const wait = /^Warte auf: (.+)$/.exec(l.msg)
    if (l.level !== 'out' && wait) waiting = wait[1]!.split(',').map((x) => x.trim().split(/\s/)[0]!).filter(Boolean)
    if (l.level === 'out') {
      // "✔ postgres Pulled", " Container jarvis-embedder-1  Started", "embedder Pulling"
      const m = /([\w.-]+)\s+(Pulling|Pulled|Downloading|Extracting|Creating|Created|Starting|Started|Running|Healthy|Waiting)\b/i.exec(l.msg)
      if (m) {
        const name = m[1]!.toLowerCase().replace(/^jarvis[-_]/, '').replace(/[-_]\d+$/, '')
        service = name
        if (/Pulled|Created|Starting|Started|Running|Healthy/i.test(m[2]!)) pulled.add(name)
        if (/Started|Running|Healthy/i.test(m[2]!)) started.add(name)
      }
    }
  }
  const [from, to] = SPAN[stage]!
  let within = 0
  if (stage === 1 && services.length) within = (pulled.size * 0.5 + started.size * 0.5) / services.length
  else if (stage === 2 && services.length && waiting) within = 1 - waiting.length / services.length
  // creep: a third of the remaining span over about four minutes, so the bar keeps moving between signals
  const creep = (1 - within) * (1 - Math.exp(-(Math.max(0, now - stageAt) / 240_000))) * 0.35
  return { fraction: Math.min(to, from + (to - from) * Math.min(1, within + creep)), stage, ...(service && stage < 3 ? { service } : {}) }
}

/** Failure texts as i18n keys under wizard.fail; raw infrastructure errors and credentials are never shown. */
export function setupTaskFailure(job: Job): { title: string; message: string } {
  if (job.status === 'interrupted') return { title: 'wizard.fail.interrupted.title', message: 'wizard.fail.interrupted.message' }
  if (job.status === 'rolled_back') return { title: 'wizard.fail.rolledBack.title', message: 'wizard.fail.rolledBack.message' }
  const text = (job.lines ?? []).filter((l) => l.level === 'error' || l.level === 'out').map((l) => l.msg).join('\n')
  if (/no space left|ENOSPC/i.test(text)) return { title: 'wizard.fail.space.title', message: 'wizard.fail.space.message' }
  if (/ENOTFOUND|EAI_AGAIN|network is unreachable|failed to resolve|TLS handshake timeout|download.*failed/i.test(text)) return { title: 'wizard.fail.download.title', message: 'wizard.fail.download.message' }
  return { title: 'wizard.fail.other.title', message: 'wizard.fail.other.message' }
}

export function previousSetupStep(step: SetupProgress['step'], source: string): SetupProgress['step'] {
  const steps: SetupProgress['step'][] = ['name', 'account', 'source', 'whatsapp', 'settings', 'remote', 'done']
  if (step === 'settings' && source === 'later') return 'source'
  return steps[Math.max(0, steps.indexOf(step) - 1)]!
}
