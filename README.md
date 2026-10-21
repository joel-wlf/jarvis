# Jarvis: persönlicher Kontext-Manager

Jarvis ist als persönlicher Kontext-Manager gedacht: ein privates System, das über die Zeit alles zusammenführt, was für dich Kontext ist, es nach Themen, Personen und Fristen ordnet, sich merkt, was du korrigierst, und Claude als Agent damit arbeiten lässt (suchen, erinnern, vorbereiten, antworten, handeln).

**Heute** ist WhatsApp die erste Quelle (Nachrichten, Sprachnachrichten, Bilder, Umfragen, Reaktionen, Gruppen). Weitere Quellen wie Mail, Kalender, Dokumente und Notizen sollen dazukommen. Die Architektur trennt dafür drei Dinge:

- **Erfassung** (Quellen-Adapter wie `wa-ingest`) schreiben normalisiert in Postgres.
- **Auswertung** (`embedder`, `organizer`) ist quellenunabhängig: Vektoren, Threads, Topics, Personenprofile.
- **Zugriff** (`mcp-server`, Wachdienst, Zentrale-Seite) arbeitet auf dem gemeinsamen Datenmodell, nicht auf einer Quelle.

Alle Daten bleiben auf deinem Gerät (Raspberry Pi). Nur die KI-Schritte (Embeddings, Transkription, Bildbeschreibung, Sortierung) gehen an die OpenAI-API.

## Überblick (aktueller Stand mit WhatsApp)

```
WhatsApp ──QR──> wa-ingest ──> postgres (pgvector) <── mcp-server <── cloudflared <── Claude
```

| Container | Aufgabe |
|---|---|
| `postgres` | Postgres 16 + pgvector. Kontakte, Chats, Nachrichten, Umfragen. Volltext (Deutsch) + Trigram-Index. Nur im internen Docker-Netz. |
| `wa-ingest` | Baileys-Client. Verknüpfung per QR, importiert Verlauf, speichert neue Nachrichten live, transkribiert Sprachnachrichten und führt Aktionen (senden, abstimmen, reagieren) aus der Tabelle `outbox` aus. |
| `embedder` | Berechnet Embeddings (multilingual-e5-small, 384 Dimensionen) für die Bedeutungssuche. Füllt fehlende Vektoren im Hintergrund auf (neueste Nachrichten zuerst). |
| `organizer` | Optional (Profil `organizer`). Sortiert Nachrichten per OpenAI-API zu Themen („Threads“) mit Zusammenfassung, Termin- und Aufgaben-Vorschlägen. Standardmäßig aus. |
| `whisper` | whisper.cpp (CPU) für die Transkription von Sprachnachrichten. Das Audio wird nicht gespeichert. |
| `mcp-server` | MCP (Streamable HTTP) mit Read-only-DB-Zugang und Suchtools. |
| `cloudflared` | Cloudflare Tunnel, macht den MCP-Server von außen erreichbar. |
| `admin` | Weboberfläche für Einrichtung, Einstellungen, Status, Logs und Wartung (Port 8080, nur Heimnetz). |

## Einrichtung auf dem Pi

Voraussetzung: Docker + Docker Compose auf dem Pi (64-bit OS), idealerweise Daten auf SSD.

### Mit der Weboberfläche (empfohlen)

```bash
git clone https://github.com/joel-wlf/jarvis.git ~/jarvis && cd ~/jarvis
docker compose up -d admin
docker compose logs admin        # zeigt den Einrichtungscode
```

Dann im Browser `http://<adresse-des-pi>:8080` öffnen, den Einrichtungscode eingeben und ein Admin-Passwort festlegen. Der Assistent fragt Name, OpenAI-Schlüssel (optional, mit Live-Test), Datenschutz-Ausschlüsse, Funktionen und Cloudflare-Tunnel ab, erzeugt alle Passwörter und den MCP-Token selbst, baut und startet die Dienste und zeigt danach den **WhatsApp-QR-Code direkt im Browser** (oder einen Kopplungscode per Telefonnummer). Am Ende steht die Connector-URL zum Kopieren bereit.

Danach ist die Oberfläche die Zentrale für alles Weitere:

| Bereich | Was geht |
|---|---|
| Übersicht | Zustand aller Dienste, WhatsApp-Verbindung, Archiv-Kennzahlen, freier Speicher, Warnungen, Connector-URL |
| Einstellungen | Alle Einstellungen aus `.env` in Gruppen, mit Suche, Experten-Modus, Prüfung während der Eingabe, Vorschau der Unterschiede und betroffenen Dienste |
| WhatsApp | QR-Code/Kopplungscode live, neu verknüpfen (das Archiv bleibt erhalten) |
| Logs | Logs je Dienst, live, mit geschwärzten Geheimnissen |
| Wartung | Dienste neu starten, nach `git pull` neu bauen, Kostenschätzung der Themen-Sortierung, MCP-Token und Datenbank-Passwörter wechseln, Admin-Passwort ändern, Protokolle früherer Vorgänge |
| Versionen | Jede frühere `.env` (die letzten 30), Unterschiede ansehen und wiederherstellen |

**So schützt die Oberfläche vor Fehlern:** Jede Änderung wird erst geprüft (Format, Grenzen, Abhängigkeiten wie „Themen-Sortierung braucht einen Schlüssel"), dann von Docker Compose gegengeprüft, bevor irgendetwas geschrieben wird. Die alte `.env` wird gesichert, die neue atomar geschrieben (ein Stromausfall hinterlässt nie eine halbe Datei). Danach startet Compose nur die betroffenen Dienste neu, und die Oberfläche wartet, bis alle stabil laufen und sich an der Datenbank anmelden können. Klappt das nicht, stellt sie den vorherigen Stand automatisch wieder her. Docker-Profile (`tunnel`, `organizer`, `local-whisper`) setzt sie passend zu den Schaltern; Datenbank-Passwörter lassen sich nur über „Wechseln" ändern, das die Datenbank mit umstellt. Es läuft immer nur ein Vorgang gleichzeitig; schließt du den Browser, läuft er weiter.

**Sicherheit der Oberfläche:** Sie steuert Docker über den Docker-Socket und hat damit Root-Rechte auf dem Pi. Deshalb: nur im Heimnetz erreichbar (nie über den Cloudflare-Tunnel veröffentlichen), Erstzugang nur mit dem Einrichtungscode aus dem Log, danach Passwort (scrypt), Sperre nach 10 Fehlversuchen, Geheimnisse gehen nie im Klartext an den Browser (Anzeigen nur mit erneuter Passwort-Eingabe). Nur auf dem Pi selbst: unter Einstellungen → Oberfläche „Erreichbar über" auf `127.0.0.1` setzen und per `ssh -L 8080:localhost:8080 <pi>` zugreifen. Passwort vergessen: `docker compose exec admin node dist/src/cli.js reset-password`. Wer die Oberfläche nicht braucht: `docker compose stop admin`.

Mit verschlüsseltem Tresor (siehe unten) zeigt `.env` auf `/srv/vault/secrets/.env`; dafür muss `JARVIS_SECRETS_DIR=/srv/vault/secrets` in `.env` stehen (das Tresor-Skript trägt es ein, die Oberfläche nennt sonst den genauen Befehl).

### Von Hand

1. `cp .env.example .env`, Pflichtwerte eintragen (Zufallswerte mit `openssl rand -hex 24`) und `OWNER_NAME` setzen. Alle Einstellungen sind in `.env.example` beschrieben.
2. **Cloudflare Tunnel** anlegen: Zero Trust → Networks → Tunnels → *Create* (Cloudflared). Token in `.env` als `CLOUDFLARE_TUNNEL_TOKEN`, dazu `COMPOSE_PROFILES=tunnel`. Public Hostname z.B. `jarvis.deine-domain.de` → Service `http://mcp-server:3000`.
3. Starten: `docker compose up -d --build`
4. **WhatsApp verknüpfen**: `docker compose logs -f wa-ingest` → QR-Code erscheint im Log. Am Handy: WhatsApp → Einstellungen → Verknüpfte Geräte → Gerät hinzufügen → scannen.
   Danach schickt das Handy den Verlauf in Batches (Log: „History-Batch importiert"). Das kann einige Minuten dauern; das Handy sollte dabei online und die App geöffnet sein.
5. Prüfen: `docker compose exec postgres psql -U jarvis -c "select count(*) from messages"`

## MCP in Claude eintragen

URL des Connectors (Token steckt im Pfad, weil Connector-Oberflächen oft keine Header erlauben):

```
https://jarvis.deine-domain.de/t/<MCP_TOKEN>/mcp
```

Clients mit Header-Support können stattdessen `https://jarvis.deine-domain.de/mcp` mit `Authorization: Bearer <MCP_TOKEN>` nutzen.
Diese URL ist geheim – wer sie hat, kann alle Chats lesen. Empfehlung: in Cloudflare Access zusätzlich absichern, falls dein Client das unterstützt.

Anleitung: `read_me` (Abschnitte overview, search, data, topics, memory, actions, limits, status live; auch als Ressource `jarvis://readme`).

Gedächtnis/Korrekturen: `remember`, `recall`, `list_memories`, `edit_memory`, `edit_topic`, `link_thread`, `move_messages`, `set_action_status`.

Lesen: `list_topics`, `get_topic` (chatübergreifende Themen mit Stand), `list_threads`, `get_thread`, `list_suggested_actions` (Themen und Vorschläge des Organizers), `semantic_search` (Bedeutungssuche + Stichwörter, für Fragen in natürlicher Sprache), `search_messages`, `get_recent_messages`, `get_conversation_context`, `list_chats`, `find_contact`, `find_scheduling_mentions`, `get_open_polls`, `run_readonly_sql`.

Schreiben (alles, was in WhatsApp selbst geht und über Baileys erreichbar ist):

| Bereich | Tools |
|---|---|
| Senden | `send_message` (inkl. Antworten, @Erwähnungen, neue Nummern), `send_media` (Bild, Video, Audio, **Sprachnachricht**, Dokument, Sticker), `send_location`, `send_contact_card`, `forward_message` |
| Nachrichten | `edit_message`, `delete_message` (für alle / nur für mich), `react_to_message`, `star_message` |
| Umfragen | `create_poll`, `vote_in_poll` |
| Chats | `manage_chat` (archivieren, anheften, stummschalten, gelesen/ungelesen, „schreibt …", leeren, löschen), `set_disappearing_messages` |
| Gruppen | `create_group`, `get_group_info`, `update_group`, `manage_group_members`, `leave_group`, `group_invite_link`, `join_group`, `group_join_requests` |
| Kontakte/Profil | `check_on_whatsapp`, `get_profile`, `manage_blocklist`, `update_my_profile`, `privacy_settings` |
| Medien ansehen | `get_media` (Bilder, Sticker, PDFs) |

Alles, was nach außen wirkt oder etwas löscht, zeigt zuerst eine Vorschau und läuft erst mit `confirm=true`. Dateien zum Verschicken: URL (nur öffentliche Adressen), base64 oder eine Datei im Ordner `outgoing/` neben `docker-compose.yml`.

Der MCP-Server schreibt dafür nur Aufträge in die Tabelle `outbox` (eigener DB-Benutzer `mcp_act`), `wa-ingest` führt sie aus. `outbox` ist zugleich das Protokoll: `select * from outbox order by id desc`. Abschalten mit `ENABLE_ACTIONS=false` in `.env`.

**Nicht möglich** (Baileys/WhatsApp lassen es nicht zu): Sprach- und Videoanrufe, Status/Stories posten, Communities, Kanäle, Broadcast-Listen, Zahlungen, Live-Standort, Videos oder Audio „ansehen". Bearbeitete oder gelöschte Nachrichten anderer bleiben im Archiv und sind mit „(bearbeitet)" / „(gelöscht)" markiert.

## Gedächtnis, Korrekturen und Hot Context

**Hot Context:** Bei jeder Verbindung bekommt Claude automatisch einen aktuellen Überblick in seinen Anweisungen: anstehende Termine (14 Tage), aktive offene Themen der letzten 7 Tage mit Personenstatus und fällige Vorschläge. Er wird live aus der Datenbank berechnet, kann also nicht veralten und braucht keinen eigenen Job.

**Gedächtnis (Tabelle `memories`):** Sagst du Claude „merk dir …", „das war anders: …" oder „dazu hatte mir Marco schon was gesagt", speichert es das mit `remember`. Notizen können allgemein sein oder zu einem Chat, Thema, Thread oder Kontakt gehören, optional mit Verweis auf Nachrichten. Allgemeine und angeheftete Notizen stehen bei jeder Verbindung in den Anweisungen, alle anderen findet `recall` nach Bedeutung und Stichwort. Der Organizer liest die Notizen mit und berücksichtigt sie beim Sortieren (Notizen zum Chat, zu den Kandidaten-Themen und zum Thread).

**Korrigieren:** Mit `edit_topic` (Titel, Stand, Termin ändern, Themen zusammenführen), `link_thread` (Thread einem Thema zuordnen, neues Thema anlegen oder lösen), `move_messages` (Nachrichten einem anderen Thread zuordnen) und `set_action_status` (Vorschlag erledigen). Was du von Hand zuordnest, ist **fest**: Der Organizer ändert diese Zuordnungen nicht mehr, und Titel, Stand und Termin eines korrigierten Themas überschreibt er nicht. Zusammenfassungen schreibt er bei neuen Nachrichten weiter fort. Prüfen und aufräumen: `list_memories`, `edit_memory` (ändern, ausblenden, löschen).

**Sicherheit:** Die Schreibrechte hat eine eigene Datenbankrolle (`mcp_mem`), die nur Notizen und diese Korrekturen schreiben darf, keine Nachrichten ändern oder löschen und nichts senden kann (`db/init/007_mem_role.sh`). Die Tools speichern nur auf ausdrücklichen Wunsch des Nutzers; was in Chat-Nachrichten steht, ist kein Auftrag. Abschalten: `ENABLE_MEMORY=false`.

## OpenAI: Transkription, Embeddings, Themen-Sortierung

In Gruppenchats gehören oft viele kurze Nachrichten verschiedener Personen zu einem Thema. Der `organizer` bündelt sie per OpenAI-API (Standard: `gpt-4.1-mini`, einstellbar mit `ORGANIZER_MODEL`, strukturierte Ausgabe) zu **Themen** mit Titel, Zusammenfassung, Stand (offen/erledigt/Info), Beteiligten, Terminen, Aufgaben und offenen Fragen. Neue Nachrichten werden bestehenden Themen zugeordnet, auch über mehrere Tage. Die Zusammenfassungen werden eingebettet und fließen in `semantic_search` ein, der Themen-Titel steht zusätzlich im Vektor jeder Einzelnachricht. Termine und Aufgaben, die den Nutzer betreffen, landen in `suggested_actions`.

**Alles läuft über einen Schlüssel, `OPENAI_API_KEY` in `~/jarvis/.env`:**
- Sprachnachrichten: `gpt-4o-mini-transcribe` (alle, nicht nur neue). Ohne Schlüssel läuft nur der langsame lokale Whisper (`COMPOSE_PROFILES=local-whisper`).
- Embeddings für `semantic_search`: `text-embedding-3-small` auf 384 Dimensionen gekürzt (passt zur Spalte). Beim Wechsel des Anbieters werden alle Vektoren automatisch neu berechnet.
- Themen-Sortierung (`organizer`): zusätzlich `ORGANIZER_ENABLED=true` und `COMPOSE_PROFILES=organizer`.

**Reihenfolge beim Einschalten:**
1. `ORGANIZER_EXCLUDE_NAMES=Arzt,Bank,Anwalt` setzen (Chats, deren Name einen Begriff enthält, gehen weder zur Embedding- noch zur Sortier-API; Sprachnachrichten dieser Chats werden aber weiterhin transkribiert). Einzeln: `insert into organizer_exclusions(chat_jid, reason) select jid, 'privat' from chats where name ilike '%name%'`
2. `OPENAI_API_KEY=…` eintragen, dann `docker compose up -d embedder wa-ingest`.
3. Themen-Sortierung vorab prüfen: `docker compose --profile organizer run --rm organizer node dist/index.js --estimate`, dann `ORGANIZER_ENABLED=true`, `COMPOSE_PROFILES=organizer`, `docker compose --profile organizer up -d organizer`.

### Chatübergreifende Themen (Stufe 2)

Der `organizer` bündelt nicht nur Nachrichten je Chat zu Threads, sondern verknüpft **Threads aus verschiedenen Chats zu einem Thema**. Beispiel: In der Gruppe „Jubaew" läuft die Anmeldung zum Spieleabend, und du fragst Marco im Einzelchat, ob er kommt. Beides wird zu einem Thema „Spieleabend" mit Gesamtstand, Termin und Personenstatus (Anna: ja, Marco: ja …).

- **Verknüpfen:** Zu jedem neuen oder geänderten Thread bekommt die KI die ähnlichsten Themen (Embedding-Suche) und die zuletzt aktiven offenen Themen und entscheidet: anhängen, neues Thema oder keins. Dabei wird der Gesamtstand neu geschrieben und ein Thema kann durch einen neuen Thread überholt werden („fällt aus" setzt es auf abgesagt).
- **Veraltet erkennen (ohne KI, stündlich):** Ein offenes Thema mit Termin wird 24 Stunden nach dem Termin zu **vorbei**. Ein offenes Thema ohne Termin und ohne Aktivität seit 21 Tagen wird **veraltet** (`TOPIC_STALE_DAYS`). Zugehörige Vorschläge werden bereinigt (erledigt oder obsolet). Neue Aktivität belebt ein Thema wieder, weil es dann erneut bewertet wird.
- **Abfragen:** `list_topics` zeigt standardmäßig nur aktuelle Themen (`include_old` für den Rest), `get_topic` zeigt Personen, offene Fragen und die Threads je Chat, `semantic_search` nennt passende Themen mit.
- **Kosten:** ein kleiner Aufruf (~1.000 Token) pro neuem oder geändertem Thread.
- **Karten für die App (Tabelle `cards`):** Derselbe Aufruf liefert zusätzlich Karten der Typen Einkauf, Paket, Geld, Reise, Ort, Adresse, Geburtstag und Zusammenhang, ohne weiteren Aufruf. Ohne KI, alle 10 Minuten: offene Versprechen („ich melde mich“, ohne spätere eigene Nachricht im Chat, `CARDS_FOLLOWUP_MIN_HOURS`/`_MAX_DAYS`), geteilte Links (`CARDS_LINK_DAYS`) und Fotos je Chat und Tag (`CARDS_PHOTOS_MIN`, `CARDS_PHOTOS_DAYS`). Erledigte oder verworfene Karten kommen nie zurück, ausgeschlossene Chats erzeugen keine Karten.

**Was an OpenAI geht:** Nachrichtentext, Absendername und Zeit der noch nicht sortierten Nachrichten (mindestens 3 Stunden alt) plus Titel/Zusammenfassung bereits bekannter Themen des Chats. Telefonnummern, IBANs, E-Mail-Adressen und Link-Pfade werden vorher geschwärzt (`ORGANIZER_REDACT=true`). Bilder, Audio und Dateien gehen nicht raus, Sprachnachrichten nur als Transkript. Ausgeschlossene Chats werden nie an die Embedding- oder Sortier-API gesendet.

**Kosten:** Preise ändern sich, bitte auf der OpenAI-Preisseite prüfen und in `.env` (`ORGANIZER_PRICE_IN/OUT`) eintragen, dann rechnet `--estimate` richtig. Es gibt ein Tagesbudget (`ORGANIZER_DAILY_TOKEN_BUDGET`, Standard 3 Mio Token).

**Erneut sortieren:** `update messages set organized_at = null, thread_id = null where chat_jid = '…'; delete from threads where chat_jid = '…';`

## Hinweise zum Raspberry Pi 4 (4 GB)

- **Speicherlimits werden vom Pi-Kernel nicht durchgesetzt** („No memory limit support"). Die `mem_limit`-Werte in `docker-compose.yml` greifen erst, wenn du in `/boot/firmware/cmdline.txt` am Zeilenende `cgroup_enable=memory cgroup_memory=1` ergänzt und neu startest. Bis dahin: `docker stats` im Auge behalten; ist der Speicher knapp, `WHISPER_MODEL=base` in `.env` setzen.
- Postgres liegt auf der SD-Karte. Das ist mit den schonenden Einstellungen okay, eine SSD wäre aber robuster.
- WhatsApp lehnt den vollen Verlaufs-Sync mit den Browser-Profilen „macOS/Windows Desktop" derzeit ab (Fehler 428, getestet). Verwendet wird deshalb „Ubuntu Chrome". Wie viel Verlauf dein Handy liefert, entscheidet WhatsApp.
- Die Embedding-Bibliothek ist bewusst `@xenova/transformers` 2.17.2: neuere ONNX-Binärdateien stürzen auf dem Pi 4 mit „illegale Instruktion" ab. Fortschritt der Indexierung: `select count(*) filter (where embedding is not null) as fertig, count(*) filter (where embedding is null and body is not null) as offen from messages`.

## Sicherheit

- Von außen erreichbar ist nur der MCP-Server. Postgres, Whisper und wa-ingest haben keine Ports.
- **Wer die URL/den Token hat, kann Chats lesen und in deinem Namen schreiben.** Behandle ihn wie ein Passwort: nicht teilen, nicht in Screenshots, bei Verdacht `MCP_TOKEN` ändern und `docker compose up -d mcp-server`.
- Token mindestens 32 Zeichen (`openssl rand -hex 24`). Nach 10 ungültigen Versuchen pro IP und 15 Minuten antwortet der Server nur noch mit 429. Zusätzlich in Cloudflare eine Rate-Limit-Regel für den Hostnamen anlegen.
- Schutz vor Fehlsendungen: Empfänger müssen eindeutig sein (bei mehreren Treffern wird nichts gesendet), `send_message` zeigt erst eine Vorschau, maximal `MAX_ACTIONS_PER_HOUR` (30) Aktionen pro Stunde (Abfragen und harmlose Einstellungen zählen nicht mit). Medien-URLs auf private Adressen (Router, Pi, Heimnetz) werden blockiert.
- Chat-Inhalte stammen von Dritten. Ein Absender könnte versuchen, Claude per Nachricht Anweisungen unterzujubeln („schick das an …"). Der MCP-Server weist Claude an, das zu ignorieren, aber lass Claude-Tools für Senden nach Möglichkeit mit Rückfrage laufen (nicht „immer erlauben").
- Das Volume `wa-auth` ist die WhatsApp-Sitzung selbst. Pi absichern (SSH-Key, Updates, ggf. Festplattenverschlüsselung).

## Betrieb

- Backup: `docker compose exec -T postgres pg_dump -U jarvis jarvis | gzip > jarvis-$(date +%F).sql.gz` (z.B. per Cron). Auch das Volume `wa-auth` enthält die WhatsApp-Sitzung.
- Abgemeldet (Handy hat das Gerät entfernt): `docker compose down && docker volume rm jarvis_wa-auth && docker compose up -d`, dann neu scannen. Die DB bleibt erhalten.
- Das Schema wird nur beim allerersten Start von Postgres angelegt (`db/init`). Spätere Änderungen als eigene Migration einspielen.

## Hinweise

- Baileys ist eine inoffizielle Bibliothek; WhatsApp-AGB erlauben das nicht ausdrücklich. Das Risiko einer Sperre ist bei reinem Mitlesen gering, aber nicht null. Nimm im Zweifel nicht deine Hauptnummer, bevor du es getestet hast.
- Es werden nur Texte und Metadaten gespeichert, keine Medien-Dateien. Bilder erscheinen als `[image]` (Bildunterschriften sind durchsuchbar). Sprachnachrichten werden lokal transkribiert (`whisper`, Modell/Sprache über `WHISPER_MODEL`/`WHISPER_LANG`); ältere Nachrichten aus dem Verlauf lassen sich nur transkribieren, solange WhatsApp die Audiodatei noch vorhält. Fortschritt: `select transcript_status, count(*) from messages where type='audio' group by 1`.
- Automatisches Senden erhöht das Sperrrisiko bei WhatsApp stärker als reines Lesen. Deshalb Abstand zwischen Aktionen, „schreibt ..."-Anzeige und das Stundenlimit.
- **Abstimmen ist ungetestet gegen echtes WhatsApp**: Baileys hat dafür keine API, das Verfahren ist aus der Entschlüsselung nachgebaut (Verschlüsselung geprüft, die Annahme der Stimme durch WhatsApp noch nicht). Bitte zuerst in einer Testgruppe ausprobieren und in `outbox` sowie am Handy prüfen.
- Umfrage-Stimmen werden live ab Einrichtung erfasst. Für ältere Umfragen aus dem Verlauf ist nicht sicher bekannt, wie du abgestimmt hast.

## Vorbereitet für später

`messages.embedding` und `memories.embedding` (`vector(1024)`) sind angelegt, aber leer. Der spätere Kontext-Service kann Embeddings berechnen, einen HNSW-Index ergänzen und `memories` / `suggested_actions` füllen – ohne Umbau der bestehenden Container.

## Diebstahlschutz (verschlüsselte Daten auf dem Pi)

Wer den Pi samt SD-Karte stiehlt, soll weder Nachrichten lesen noch dein WhatsApp-Konto übernehmen können.

**Was verschlüsselt ist:** Ein LUKS2-Container (`/srv/vault.img`, eingehängt unter `/srv/vault`) enthält das komplette Docker-Datenverzeichnis (Postgres mit allen Nachrichten, die WhatsApp-Sitzung, Container-Logs), die `.env` (API-Schlüssel, Token, Passwörter) und die Backups. `~/jarvis/.env` und `~/jarvis-backups` sind Verweise dorthin. Verschlüsselt wird mit Adiantum (schnell auf dem Pi 4 ohne AES-Hardware), das Passwort wird mit Argon2id abgeleitet.

**Einrichtung (einmalig, auf dem Pi):** `scripts/vault-setup.sh`. Das Skript fragt interaktiv nach dem Passwort, legt den Container an, verschiebt die Daten, prüft die Nachrichtenzahl und überschreibt erst dann die alten Klartext-Dateien. Es schaltet außerdem den Zram-Writeback und die Swap-Datei ab, die Klartext aus dem Arbeitsspeicher auf die SD-Karte schreiben könnten. Bricht es in Schritt 7 ab, setzt `scripts/vault-finish.sh` fort.

**Nach jedem Neustart oder Stromausfall:** Docker startet nur, wenn der Container eingehängt ist (systemd-Bedingung). Entsperren vom Rechner aus:

```bash
ssh -t <benutzer>@<pi-adresse> jarvis-unlock
```

Das Passwort kann niemand zurücksetzen. Im Passwort-Manager aufbewahren.

**Grenzen:**
- Die alten Klartext-Daten wurden überschreibend gelöscht. Auf SD-Karten bleiben durch Wear-Leveling trotzdem unter Umständen Reste in unbenutzten Blöcken. Wer das ausschließen will, spielt die Karte neu auf und stellt aus dem Backup wieder her.
- Läuft der Pi und ist entsperrt, schützt die Verschlüsselung nicht (Zugriff per SSH, Cold-Boot-Angriffe). SSH nur mit Schlüssel, `PasswordAuthentication no`.
- Der Cloudflare-Tunnel-Token liegt in `/etc/cloudflared/token` unverschlüsselt.

**Notfallplan bei Diebstahl:**
1. WhatsApp: Verknüpfte Geräte, Gerät "Jarvis" entfernen (beendet die Sitzung sofort).
2. Cloudflare Zero Trust: Tunnel löschen oder Token neu erzeugen.
3. OpenAI: API-Schlüssel widerrufen.
4. Neuen `MCP_TOKEN` setzen und den Connector in Claude neu einrichten.

## Mitwirken und Lizenz

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und [SECURITY.md](SECURITY.md). Lizenz: [MIT](LICENSE). Jarvis ist ein inoffizielles Projekt und nicht mit WhatsApp/Meta verbunden; die Nutzung von Baileys erfolgt auf eigenes Risiko und kann gegen die WhatsApp-Nutzungsbedingungen verstoßen.
