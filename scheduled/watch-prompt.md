# Jarvis-Watch

Der Watch ist ein Claude Scheduled Task (`jarvis-wachdienst`, stündlich 07:00 bis 21:00, Cron `0 7-21 * * *`).
Der Task heißt auf bestehenden Installationen weiter `jarvis-wachdienst`; der Name ist nur eine ID und kann so bleiben.
Den aktuellen Prompt findest du in `~/.claude/scheduled-tasks/jarvis-wachdienst/SKILL.md` und änderst ihn in der App unter "Scheduled".

## Aufgabenverteilung

- **Jarvis (Server):** `get_dashboard` berechnet alle Kandidaten aus demselben Feed wie die App (Erinnerungen, Termine aus Themen und Chats, unbeantwortete Fragen und Sprachnachrichten in Einzelchats, offene Umfragen, Aufgaben, Gesundheit; alles übrige unter `more`) und filtert Zurückgestelltes, Unwichtiges und per Regel Ausgeblendetes heraus. Das Format der Abschnitte ist unverändert; `events` enthält auch Termine aus Chats (Schlüssel `aktion:<id>`) und `actions` nur Aufgaben. `to_notify` nennt, was jetzt gemeldet werden soll. Jede Karte hat `priority` (3 wichtig, 2 normal, 1 später, `null` = nicht festgelegt), vom Nutzer in der App oder über `watch_feedback` gesetzt: Wichtiges steht immer in `to_notify`, solange es neu ist, Spätes nie.
- **Watch (Claude):** prüft die Kandidaten im Chat-Kontext, entscheidet, ob wirklich etwas zu melden ist, sendet höchstens eine gebündelte Push-Nachricht und ruft danach `watch_mark_notified` auf.
- **Karten für Claude:** `list_cards`, `get_card` und `act_on_card` geben die Karten der App mit Hintergrund und vorbereiteten Schritten zurück und führen sie aus. Der Watch meldet Karten aus `more` nur, wenn der Nutzer sie als wichtig markiert hat.
- **Jarvis Zentrale (optional):** eine Claude-Artifact-Seite mit denselben Karten und Schnellaktionen (Später, Unwichtig, Chat stumm, Erledigt, Antwort im eigenen Stil vorschlagen). Nicht Teil des Repos.

## Zustand (alles in Postgres)

- `reminders`: Erinnerungen des Nutzers (`create_reminder`, `list_reminders`, `update_reminder`).
- `watch_state`: pro Meldeschlüssel zuletzt gemeldet, zurückgestellt bis, unwichtig (`watch_feedback`, `watch_state`, `watch_mark_notified`).
- Schlüssel: `event:<topic>:<vortag|kurz|info>`, `frage:<chat_jid>:<epoche>`, `umfrage:<id>`, `aktion:<id>`, `reminder:<id>`, `health`. Regeln und Gelerntes der App liegen unter `rule:chat:<jid>`, `rule:type:<art>`, `rule:learning` und `learn:…`; sie decken keine Meldeschlüssel ab und sind keine Meldungen.
- Ein Schlüssel ohne Zusatz gilt als Präfix: `frage:<chat_jid>` blendet alle Fragen aus diesem Chat aus, `umfrage:` alle Umfragen.

## Schreibstil

`get_writing_style(chat)` liefert Kennzahlen und echte Beispiele aus des Nutzers eigenen Nachrichten (pro Chat, bei wenig Material ergänzt durch ähnliche Personen). Die Jarvis-Anweisungen verlangen, das vor jedem Entwurf oder Senden zu nutzen.
