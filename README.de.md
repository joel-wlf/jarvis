<p align="center">
  <img src="app/assets/jarvis/idle_a.png" width="200" alt="Jarvis, a round white companion in a hat with a dark visor">
</p>

<h1 align="center">Jarvis</h1>

<p align="center"><em>A private context manager that turns your messages into decisions.<br>Self-hosted. Your data stays on your hardware.</em></p>

<p align="center">
  <a href="https://github.com/joel-wlf/jarvis/actions/workflows/ci.yml"><img src="https://github.com/joel-wlf/jarvis/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-121416" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/runs%20on-Raspberry%20Pi%20%C2%B7%20arm64%20%C2%B7%20amd64-121416" alt="Runs on Raspberry Pi, arm64 and amd64">
</p>

<p align="center"><a href="https://joel-wlf.github.io/jarvis/">Dokumentation</a> · <a href="README.md">English</a></p>

Jarvis hält dein WhatsApp-Archiv auf einem kleinen Linux-Rechner, der dir gehört, durchsucht es nach Bedeutung und zeigt, was dich braucht: offene Fragen, Termine, Aufgaben, Umfragen. Du nutzt es in einer Web- oder Mobil-App und kannst Claude oder jeden MCP-Client anbinden, um Fragen zu deinen eigenen Gesprächen zu stellen.

## Installieren

**Am einfachsten, ohne Terminal:** Lade das Raspberry-Pi-Image `jarvis-…-arm64.img.xz` aus der [neuesten Version](https://github.com/joel-wlf/jarvis/releases/latest), schreib es mit dem [Raspberry Pi Imager](https://www.raspberrypi.com/software/) auf eine SD-Karte (WLAN in den Imager-Einstellungen, mit Kabel nichts), steck sie in einen Raspberry Pi 4 oder 5 und öffne **http://jarvis.local**. Den Rest erledigt der Assistent im Browser, auch die KI: einfach bei OpenRouter anmelden. Updates kommen danach jede Nacht von selbst. Schritt für Schritt im [Schnellstart](docs/content/docs/de/quickstart.mdx).

**Auf einem vorhandenen 64-bit-Linux-Rechner** mit Terminal (ein Raspberry Pi 4 mit 4 GB reicht):

```bash
curl -fsSL https://raw.githubusercontent.com/joel-wlf/jarvis/main/install.sh -o install-jarvis.sh
bash install-jarvis.sh
```

Das Skript prüft Docker, lädt Jarvis herunter und startet die Einrichtung. Öffne dann die angezeigte Adresse `http://<dein-server>:8081` und folge den Schritten im Browser: benennen, Passwort setzen, WhatsApp per QR-Code koppeln, fertig. Fertige Images für arm64 und amd64 werden geladen, auf deinem Rechner wird nichts kompiliert.

Lieber Compose? `git clone https://github.com/joel-wlf/jarvis.git && cd jarvis && docker compose up -d admin app-web`, dann dieselbe Adresse öffnen.

## Das bekommst du

- **Suche, die Bedeutung versteht**, nicht nur Stichwörter, über alle Chats.
- **Karten für das, was dich braucht**: unbeantwortete Fragen, Termine, Aufgaben, offene Umfragen, Fristen.
- **Themen über Chats hinweg** mit kurzen Zusammenfassungen, automatisch sortiert, wenn du es einschaltest.
- **Jarvis fragen** in der App oder aus Claude und anderen KI-Clients per MCP.
- **Sichere Aktionen**: Senden, Abstimmen und Reagieren nur mit deiner Erlaubnis, immer mit Vorschau und Limit.
- **Deine Hardware, deine Regeln**: Dein Archiv bleibt auf deinem Rechner, du wählst den KI-Anbieter, ausgeschlossene Chats werden nie gesendet.

## So funktioniert es

Postgres mit pgvector hält deine Nachrichten. `wa-ingest` koppelt sich als verknüpftes Gerät mit WhatsApp und speichert Nachrichten live. `embedder` macht sie nach Bedeutung durchsuchbar, `organizer` (optional) ordnet sie Themen zu, `mcp-server` stellt Suche und Aktionen bereit, `admin` und `app-web` liefern Einrichtung und App auf einem Port.

Details zu jedem Teil: [Dokumentation](https://joel-wlf.github.io/jarvis/) und die [ausführliche Referenz](docs/REFERENCE.de.md) (Betrieb, Sicherheit, OpenAI, Raspberry Pi, Verschlüsselung).

## Anleitungen

- [Schnellstart](docs/content/docs/de/quickstart.mdx) und [Raspberry-Pi-Hinweise](docs/content/docs/de/raspberry-pi.mdx)
- [Claude und andere MCP-Clients verbinden](docs/content/docs/de/connect-claude.mdx)
- [Sicherheit und Datenschutz](docs/content/docs/de/security.mdx)
- [Kartentypen](docs/content/docs/de/card-types.mdx) und [App-API](docs/content/docs/de/api.mdx)
- [Mitwirken](CONTRIBUTING.md)

## Bitte lesen

- Jarvis ist ein unabhängiges Open-Source-Projekt und steht **in keiner Verbindung zu WhatsApp oder Meta**, wird nicht von ihnen unterstützt. WhatsApp ist eine Marke von WhatsApp LLC.
- Die WhatsApp-Verbindung ist **inoffiziell** (die Open-Source-Bibliothek [Baileys](https://github.com/WhiskeySockets/Baileys), als verknüpftes Gerät). Sie kann gegen die Nutzungsbedingungen verstoßen, **Konten können eingeschränkt oder gesperrt werden**, und sie kann jederzeit nicht mehr funktionieren. Nutzung auf eigenes Risiko; erwäge eine Zweitnummer.
- Wenn du KI-Funktionen aktivierst, wird **Nachrichteninhalt an den von dir gewählten Anbieter gesendet** (z. B. OpenAI), auch Nachrichten deiner Kontakte. Dessen Bedingungen gelten.
- Dein Archiv enthält **Nachrichten anderer Personen**. Du bist für den rechtmäßigen Umgang damit verantwortlich (z. B. nach DSGVO).
- Ohne Gewähr. Siehe [LICENSE](LICENSE) und den [vollständigen Haftungshinweis](https://joel-wlf.github.io/jarvis/de/docs/disclaimer).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
