# Mitwirken

Beiträge sind willkommen. Kurzfassung:

1. Issue anlegen oder kommentieren, bevor du größere Änderungen startest.
2. Pro Dienst (`mcp-server`, `wa-ingest`, `organizer`, `embedder`) gilt: `npm ci && npm run build` muss ohne Fehler laufen (das macht auch die CI).
3. Datenbankänderungen als neue, idempotente Datei in `db/init/` (fortlaufende Nummer). Bestehende Dateien nicht ändern.
4. Keine persönlichen Daten, Namen, Tokens oder Chat-Ausschnitte in Code, Tests, Issues oder Commits. Der eigene Name kommt aus `OWNER_NAME`.
5. Neue Tools im MCP-Server auch in `mcp-server/src/readme.ts` beschreiben.

Scope: Der Kern ist Erfassung (Quellen-Adapter), Auswertung (Embeddings, Organizer) und Zugriff (MCP). Telefonie/SIP/Anrufe sind bewusst nicht Teil des Projekts.
