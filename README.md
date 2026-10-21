# Jarvis: persönlicher Kontext-Manager

Jarvis ist als persönlicher Kontext-Manager gedacht: ein privates System, das über die Zeit alles zusammenführt, was für dich Kontext ist, es nach Themen, Personen und Fristen ordnet, sich merkt, was du korrigierst, und Claude als Agent damit arbeiten lässt (suchen, erinnern, vorbereiten, antworten, handeln).

**Heute** ist WhatsApp die erste Quelle (Nachrichten, Sprachnachrichten, Bilder, Umfragen, Reaktionen, Gruppen). Weitere Quellen wie Mail, Kalender, Dokumente und Notizen sollen dazukommen. Die Architektur trennt dafür drei Dinge:

- **Erfassung** (Quellen-Adapter wie `wa-ingest`) schreiben normalisiert in Postgres.
- **Auswertung** (`embedder`, `organizer`) ist quellenunabhängig: Vektoren, Threads, Topics, Personenprofile.
- **Zugriff** (`mcp-server`, Watch, Zentrale-Seite) arbeitet auf dem gemeinsamen Datenmodell, nicht auf einer Quelle.

Dein Archiv liegt auf deinem eigenen Linux-Rechner (auch Raspberry Pi). Externe KI-Aufrufe bleiben bei der Einrichtung zunächst ausgeschaltet. Aktivierst du sie, werden je nach Funktion Texte, Audios oder Bilder an den gewählten Anbieter übertragen.

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
| `mcp-server` | MCP (Streamable HTTP) mit Read-only-DB-Zugang und Suchtools. |
| `cloudflared` | Cloudflare Tunnel, macht den MCP-Server von außen erreichbar. |
| `admin` | Passwortinstanz, Einrichtung, Einstellungen, Status, Logs und Wartung; nur intern erreichbar. |
| `app-web` | Gemeinsamer Einstieg auf Port 8081: Expo-Weboberfläche, App-API, Verwaltung und MCP. |

## Installation auf Linux

### Mit dem GitHub-Installationsskript

```bash
curl -fsSL https://raw.githubusercontent.com/joel-wlf/jarvis/main/install.sh -o install-jarvis.sh
bash install-jarvis.sh
```

Das Skript prüft Docker und Compose. Auf Debian/Ubuntu bietet es die Installation von Docker nach ausdrücklicher Auswahl an. Es löst die gewählte GitHub-Version auf einen festen Commit auf, lädt die Quellen einschließlich Compose-YAML und startet den Browser-Assistenten. Ohne Desktop zeigt es die Adresse für einen anderen Rechner im Heimnetz. Optionen: `--version <Tag-oder-Commit>`, `--dir <Ordner>`, `--port <Port>`; Standard: `~/jarvis` und Port `8081`. Vorhandene Installationen werden fortgesetzt und nicht überschrieben.

### Direkt mit Docker Compose

Voraussetzung: Git, Docker Engine und das Compose-Plugin; 64-bit Linux, vorzugsweise mit SSD.

```bash
git clone https://github.com/joel-wlf/jarvis.git ~/jarvis
cd ~/jarvis
docker compose up -d --build admin app-web
docker compose logs admin
```

Öffne `http://<server-ip>:8081` (am Server selbst `http://localhost:8081`). Das ist derselbe Assistent wie beim Installationsskript. Du brauchst weder eine vorbereitete `.env` noch laufende Datenbankdienste.

### Der gemeinsame Assistent

**Benennen → Passwort → Quelle → WhatsApp → Einstellungen → Fernzugriff → Fertig**

- Gib dem Assistenten einen Namen (Standard: Jarvis). Dein eigener Name ist eine separate Einstellung.
- Lege beim ersten Öffnen dein eigenes Passwort mit 15–200 Zeichen fest. Ein Einrichtungscode ist nicht nötig. Wer das Passwort zuerst festlegt, wird Besitzer. Es gilt für Web, Mobile, Verwaltung und die MCP-Anmeldung. Es gibt genau einen Besitzer, ohne Benutzername oder E-Mail.
- Wähle WhatsApp oder „Später verbinden“. Vor der Kopplung erscheinen Hinweise zur inoffiziellen Anbindung und Archivierung.
- Jarvis erzeugt die technischen Geheimnisse und startet die Basisdienste. Der WhatsApp-QR erscheint im Browser. Am Handy: WhatsApp → Verknüpfte Geräte → Gerät hinzufügen. Alternativ steht die Kopplung per Telefonnummer bereit.
- Externe KI ist optional. Konfiguriere vor dem Aktivieren Datenschutz-Ausschlüsse und die Verarbeitung von Sprache, Bildern, Suche und Themen. Hinweise erklären Datenübertragung und API-Kosten. Ausschlüsse für Suche/Themen gelten nicht automatisch für Sprache und Bilder.
- Fernzugriff ist optional: Heimnetz, Cloudflare-Walkthrough oder vorhandene HTTPS-Adresse. Für einen Tunnel lautet das Dienstziel **`http://app-web:8084`**. Dieser Listener ist nur im Docker-Netz erreichbar. Die öffentliche Adresse muss auf diesen Jarvis-Server zeigen; das wird geprüft.
- Zum Schluss erscheinen die Server-Adresse und ein **QR-Code nur mit dieser Adresse** sowie der MCP-Anschluss für Claude und andere KI-Clients.

Bestätigte Schritte und nicht geheime Eingaben bleiben nach Browser-Schließen oder Neustart gespeichert. Gleichzeitige Änderungen aus mehreren Fenstern werden abgewiesen. Technische Änderungen nutzen weiterhin die Compose-Prüfung, Sicherungen und automatischen Rollback. Ein fehlgeschlagener Erststart kann mit denselben generierten Datenbank-Passwörtern wiederholt werden.

### Web und Mobile

Im Browser kennt die Anwendung ihren Server bereits und fragt bei einer eingerichteten Installation direkt nach dem Passwort. Die Mobile App nimmt zuerst die Server-Adresse entgegen, per Eingabe oder Scan, und fragt danach dasselbe Passwort ab. Der QR-Code enthält kein Passwort und keinen Anmeldetoken; auch alte Kopplungs-QRs ersetzen die Passwortanmeldung nicht mehr.

Unter **System → Verbindungen** findest du dauerhaft die Mobile-Verbindung und den MCP-Anschluss. Unter Geräte lassen sich Gerätesitzungen und OAuth-Clients widerrufen.

### Fernzugriff und Verwaltung

Über den gemeinsamen HTTPS-Einstieg ist auch die passwortgeschützte Verwaltung unterwegs erreichbar. Der Admin-Dienst steuert Docker und besitzt damit weitreichende Rechte auf dem Server. Verwende ein eigenes langes Passwort. Geheimnisse sind in Einstellungsantworten maskiert; Anzeigen und Rotation verlangen das Passwort erneut. Anmeldeversuche werden begrenzt. Datenbank, Admin- und MCP-Dienst sowie interne Authentifizierungsports besitzen keinen eigenen veröffentlichten Host-Port.

Im Heimnetz nutzt die Standardadresse HTTP. Verwende Fernzugriff ausschließlich über HTTPS. Für eigenen Reverse-Proxy-Betrieb leitet der Proxy auf den Web-Port 8081 weiter; Cloudflare innerhalb dieses Compose-Projekts verwendet den internen Listener 8084.

Passwort vergessen: `docker compose exec admin node dist/src/cli.js reset-password`. Danach das Passwort im Browser erneut einrichten; wer dies zuerst tut, wird Besitzer. Passwortwechsel oder Zurücksetzen widerruft bisherige App- und OAuth-Sitzungen. Der Admin-Dienst muss für Anmeldung und Verwaltung laufen. Frühere lokale Transkriptionskonfigurationen werden beim Upgrade ausgeschaltet, der alte Container wird entfernt; ein vorhandener API-Schlüssel aktiviert dabei keine Transkription.

### Bestehende Installation umstellen

Quellen aktualisieren und `docker compose up -d --build admin app-web` ausführen. Fehlende interne Authentifizierungsgeheimnisse werden ergänzt und betroffene Dienste gestartet. Bestehendes Admin-Passwort bleibt gültig und wird maßgeblich; ein früher separat gesetztes App-Passwort entfällt. Geräte müssen sich einmal neu anmelden. Archiv und WhatsApp-Verknüpfung bleiben erhalten. Bestehende Cloudflare-Routen auf **`http://app-web:8084`** umstellen; lokale Reverse-Proxys verwenden Port 8081. Bei älteren Datenbanken müssen die idempotenten App-Tabellen aus `db/init/014_app.sql` bereits eingespielt sein.

## MCP mit Claude und anderen KI-Clients verbinden

Jarvis stellt einen **MCP-Server** bereit. Damit kann ein KI-Client Nachrichten und Themen suchen, Kontext abrufen, Erinnerungen speichern und freigegebene WhatsApp-Aktionen ausführen.

Trage in einem Client mit MCP-OAuth-Unterstützung diese Connector-Adresse ein:

```text
https://jarvis.deine-domain.de/mcp
```

Melde dich auf der Jarvis-Seite mit deinem gemeinsamen Passwort an und bestätige die Verbindung. Cloudbasierte Clients benötigen eine öffentliche HTTPS-Adresse. Den Anschluss erklärt der Assistent; später steht er unter **System → Verbindungen**.

Bestehende Token-Clients können weiterhin `/t/<MCP_TOKEN>/mcp` oder `/mcp` mit `Authorization: Bearer <MCP_TOKEN>` verwenden, solange `MCP_LEGACY_TOKEN=true` ist. Diese Token sind geheim: Sie erlauben den Zugriff auf Chats und freigegebene Aktionen, **keine Server-Verwaltung**. Die Mobile-App-QR-Codes enthalten solche Token nicht.

Werkzeuge und Grenzen erklärt `read_me` (auch als Ressource `jarvis://readme`). Zu den Funktionen zählen Suche, Themen, Gedächtnis und Korrekturen sowie WhatsApp-Aktionen über die `outbox`. Bei neuen Installationen ist die Vorschau vor Aktionen aktiviert (`REQUIRE_CONFIRM=true`). Abschalten von Aktionen: `ENABLE_ACTIONS=false`.

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

Mit `REQUIRE_CONFIRM=true` zeigen Aktionen zuerst eine Vorschau und laufen erst mit `confirm=true`. Der neue Assistent aktiviert diese Einstellung. Dateien zum Verschicken: URL (nur öffentliche Adressen), base64 oder eine Datei im Ordner `outgoing/` neben `docker-compose.yml`.

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
- Sprachnachrichten: `gpt-4o-mini-transcribe` (alle, nicht nur neue). Ohne Schlüssel werden Sprachnachrichten nicht transkribiert. Transkription lässt sich mit `TRANSCRIBE_PROVIDER=off` ausschalten; lokale Transkription wird nicht unterstützt.
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

**Was an OpenAI geht:** Nachrichtentext, Absendername und Zeit der noch nicht sortierten Nachrichten (mindestens 3 Stunden alt) plus Titel/Zusammenfassung bereits bekannter Themen des Chats. Telefonnummern, IBANs, E-Mail-Adressen und Link-Pfade werden vorher geschwärzt (`ORGANIZER_REDACT=true`). Bilder, Audio und Dateien gehen nicht raus, Sprachnachrichten nur als Transkript. Ausgeschlossene Chats werden nie an die Embedding- oder Sortier-API gesendet.

**Kosten:** Preise ändern sich, bitte auf der OpenAI-Preisseite prüfen und in `.env` (`ORGANIZER_PRICE_IN/OUT`) eintragen, dann rechnet `--estimate` richtig. Es gibt ein Tagesbudget (`ORGANIZER_DAILY_TOKEN_BUDGET`, Standard 3 Mio Token).

**Erneut sortieren:** `update messages set organized_at = null, thread_id = null where chat_jid = '…'; delete from threads where chat_jid = '…';`

## Hinweise zum Raspberry Pi 4 (4 GB)

- **Speicherlimits werden vom Pi-Kernel nicht durchgesetzt** („No memory limit support"). Die `mem_limit`-Werte in `docker-compose.yml` greifen erst, wenn du in `/boot/firmware/cmdline.txt` am Zeilenende `cgroup_enable=memory cgroup_memory=1` ergänzt und neu startest. Bis dahin: `docker stats` im Auge behalten.
- Postgres liegt auf der SD-Karte. Das ist mit den schonenden Einstellungen okay, eine SSD wäre aber robuster.
- WhatsApp lehnt den vollen Verlaufs-Sync mit den Browser-Profilen „macOS/Windows Desktop" derzeit ab (Fehler 428, getestet). Verwendet wird deshalb „Ubuntu Chrome". Wie viel Verlauf dein Handy liefert, entscheidet WhatsApp.
- Die Embedding-Bibliothek ist bewusst `@xenova/transformers` 2.17.2: neuere ONNX-Binärdateien stürzen auf dem Pi 4 mit „illegale Instruktion" ab. Fortschritt der Indexierung: `select count(*) filter (where embedding is not null) as fertig, count(*) filter (where embedding is null and body is not null) as offen from messages`.

## Sicherheit

- Von außen erreichbar ist der gemeinsame Web-Einstieg, optional über Cloudflare: App, authentifizierte Verwaltung und MCP. Die einzelnen Dienste haben keine veröffentlichten Ports.
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
- Es werden nur Texte und Metadaten gespeichert, keine Medien-Dateien. Bilder erscheinen als `[image]` (Bildunterschriften sind durchsuchbar). Sprachnachrichten werden nur mit aktiviertem API-Anbieter transkribiert (Modell/Sprache über `OPENAI_TRANSCRIBE_MODEL`/`TRANSCRIBE_LANG`); ältere Nachrichten aus dem Verlauf lassen sich nur transkribieren, solange WhatsApp die Audiodatei noch vorhält. Fortschritt: `select transcript_status, count(*) from messages where type='audio' group by 1`.
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
