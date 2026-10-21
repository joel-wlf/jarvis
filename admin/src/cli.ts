import path from 'node:path'
import { Auth } from './auth.js'

// Hilfsbefehle im Container:  docker compose exec admin node dist/src/cli.js reset-password
const DATA = process.env.ADMIN_DATA_DIR ?? '/data'
const [cmd] = process.argv.slice(2)

if (cmd === 'reset-password') {
  new Auth(path.join(DATA, 'auth')).resetPassword()
  console.log('Admin-Passwort entfernt. Öffne jetzt die Weboberfläche und lege ein neues Passwort fest. Wer dies zuerst tut, wird Besitzer.')
  process.exit(0)
}
if (cmd === 'setup-code') {
  const auth = new Auth(path.join(DATA, 'auth'))
  console.log(auth.isConfigured() ? 'Der Zugang ist schon eingerichtet (Passwort vergessen: reset-password).' : 'Es ist kein Einrichtungscode nötig. Lege dein Passwort in der Weboberfläche fest.')
  process.exit(0)
}
console.log('Befehle: reset-password | setup-code')
process.exit(cmd ? 1 : 0)
