# Mitwirken

Beiträge sind willkommen. Kurzfassung:

1. Issue anlegen oder kommentieren, bevor du größere Änderungen startest.
2. Pro Dienst (`mcp-server`, `wa-ingest`, `organizer`, `embedder`) gilt: `npm ci && npm run build` muss ohne Fehler laufen (das macht auch die CI).
3. Datenbankänderungen als neue, idempotente Datei in `db/init/` (fortlaufende Nummer). Bestehende Dateien nicht ändern.
4. Keine persönlichen Daten, Namen, Tokens oder Chat-Ausschnitte in Code, Tests, Issues oder Commits. Der eigene Name kommt aus `OWNER_NAME`.
5. Neue Tools im MCP-Server auch in `mcp-server/src/readme.ts` beschreiben.
6. Neue Einstellung (Umgebungsvariable): in `admin/src/schema.ts` beschreiben, in `docker-compose.yml` mit gleichem Standardwert durchreichen und `cd admin && npm run gen-env-example` ausführen. `npm test` in `admin/` prüft, dass Schema, Compose und `.env.example` zusammenpassen.

Scope: Der Kern ist Erfassung (Quellen-Adapter), Auswertung (Embeddings, Organizer) und Zugriff (MCP). Telefonie/SIP/Anrufe sind bewusst nicht Teil des Projekts.

## Admin-Oberfläche entwickeln

Ohne Docker-Daemon und Datenbank, mit simulierten Diensten:

```bash
cd admin && npm ci && npm run build
JARVIS_FAKE_DOCKER=1 JARVIS_PROJECT_DIR=/tmp/jarvis-dev ADMIN_DATA_DIR=/tmp/jarvis-dev-data PORT=8099 npm start
```

`OWNER_NAME=Fehler` lässt im Simulationsmodus den MCP-Server abstürzen, so lässt sich der automatische Rollback ausprobieren.
