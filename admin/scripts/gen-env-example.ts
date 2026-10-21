import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIELDS, GROUPS } from '../src/schema.js'

/** Erzeugt .env.example aus dem Schema, damit Beispiel, Oberfläche und Compose nie auseinanderlaufen. */
export function renderEnvExample(): string {
  const out: string[] = [
    '# Jarvis-Einstellungen. Am einfachsten über die Admin-Oberfläche einrichten:',
    '#   docker compose up -d --build admin app-web   und dann http://<server>:8081 öffnen',
    '# Von Hand: nach .env kopieren und mindestens die Pflichtwerte setzen. Zufallswerte: openssl rand -hex 24',
    '# Diese Datei wird erzeugt (cd admin && npm run gen-env-example), bitte admin/src/schema.ts ändern.',
  ]
  for (const g of GROUPS) {
    const fields = FIELDS.filter((f) => f.group === g.id && !f.managed)
    if (!fields.length) continue
    out.push('', `# ===== ${g.label} =====`)
    for (const f of fields) {
      const opts = f.options ? ` Werte: ${f.options.map((o) => o.value || '(leer)').join(' | ')}.` : ''
      out.push(`# ${f.label}${f.required ? ' (Pflicht)' : ''}: ${f.help}${opts}`)
      out.push(f.required ? `${f.key}=` : `#${f.key}=${f.default}`)
    }
  }
  out.push('', '# Docker-Profile (tunnel, organizer). Die Oberfläche setzt sie automatisch passend.', '#COMPOSE_PROFILES=')
  return out.join('\n') + '\n'
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env.example')
  fs.writeFileSync(target, renderEnvExample())
  console.log(`geschrieben: ${target}`)
}
