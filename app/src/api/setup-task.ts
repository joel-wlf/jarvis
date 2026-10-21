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

export function setupTaskFailure(job: Job): { title: string; message: string } {
  if (job.status === 'interrupted') return { title: 'Einrichtung unterbrochen', message: 'Dein Server wurde während der Einrichtung neu gestartet. Deine gespeicherten Eingaben bleiben erhalten. Versuche den Schritt noch einmal.' }
  if (job.status === 'rolled_back') return { title: 'Änderung nicht übernommen', message: 'Diese Änderung hat nicht funktioniert. Jarvis hat versucht, den vorherigen Zustand wiederherzustellen. Du kannst deine Eingaben anpassen oder es erneut versuchen.' }
  const text = (job.lines ?? []).filter((l) => l.level === 'error' || l.level === 'out').map((l) => l.msg).join('\n')
  if (/no space left|ENOSPC/i.test(text)) return { title: 'Dein Server hat zu wenig Speicherplatz', message: 'Schaffe auf deinem Server freien Speicherplatz. Danach kannst du diesen Schritt erneut versuchen.' }
  if (/ENOTFOUND|EAI_AGAIN|network is unreachable|failed to resolve|TLS handshake timeout|download.*failed/i.test(text)) return { title: 'Ein Download ist fehlgeschlagen', message: 'Prüfe die Internetverbindung deines Servers und versuche es erneut. Bereits gespeicherte Eingaben bleiben erhalten.' }
  return { title: 'Dieser Schritt konnte nicht abgeschlossen werden', message: 'Du kannst es erneut versuchen oder zurückgehen und deine Eingaben ändern. Dein Passwort und bereits gespeicherte Einstellungen bleiben erhalten.' }
}

export function previousSetupStep(step: SetupProgress['step'], source: string): SetupProgress['step'] {
  const steps: SetupProgress['step'][] = ['name', 'account', 'source', 'whatsapp', 'settings', 'remote', 'done']
  if (step === 'settings' && source === 'later') return 'source'
  return steps[Math.max(0, steps.indexOf(step) - 1)]!
}
