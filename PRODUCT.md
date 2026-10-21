# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Expo serves the same application on web and native mobile. Web discovers its server from the page origin; native first accepts the server URL or scans a URL-only QR, then asks for the same single-owner password.

## Users

People who run Jarvis on their own Raspberry Pi to keep a private, searchable archive of their WhatsApp (later also mail, calendar, documents, notes). The project is open source: the primary user is whoever installed it for themselves, not only the author. They open the interface as often on the phone (a quick look in between) as on a laptop (a deliberate pass through what is open). They must understand it without an explanation from the author.

Their job: not let anything slip. See what needs them now (a question someone asked, a date coming up, a poll, a task that fell out of a group chat), decide quickly, and act or let Jarvis prepare the action.

## Product Purpose

Jarvis is a personal context manager. It collects everything that is context for the owner, orders it by topics, people, and deadlines, remembers corrections, and lets Claude work with it as an agent (search, remind, prepare, answer, act).

The web interface exists first to present what Jarvis has distilled from the messages: suggested actions, dates, open questions, polls, reminders, and context. Setup, settings, status, logs, and maintenance are a secondary area of the same interface.

Success: the owner opens the page, sees within seconds what needs them, handles each item in one or two moves (done, later, unimportant, or one of Jarvis's prepared replies/reactions), and trusts that nothing important is missing.

## Positioning

Everything is distilled from the owner's own conversations, on hardware they own. Jarvis does not just list messages; it turns them into decisions with prepared next steps, grounded in context from other chats and its memory of the person.

## Operating Context

- Self-hosted on Linux (including Raspberry Pi) with Docker Compose. The GitHub installer and Compose open the same resumable Expo setup wizard at port 8081. An optional Cloudflare tunnel exposes that same entry point, including authenticated administration; internal service ports are not published.
- Data lives in Postgres (pgvector): messages, chats, contacts, threads, topics (with event dates and people), suggested_actions, reminders, watch_state (notified, snoozed, dismissed per item key), polls and votes, contact profiles, memory.
- The organizer (optional, OpenAI) sorts messages into threads and topics with summaries, dates, todos, and open questions. Without an API key the archive and local search continue; voice transcription, image descriptions and the organizer are off. Local voice transcription is not supported.
- A scheduled "Watch" (watch service) uses the same item keys and states (`event:<id>:<stage>`, `frage:<chat>:<ts>`, `umfrage:<id>`, `aktion:<id>`, `reminder:<id>`) to decide what to notify.
- Outgoing actions (send, vote, react) go through the `outbox` table and are executed by wa-ingest, with confirmation and an hourly limit configurable.
- Interface language: English by default, German when the device or the owner picks it (System → Language). Server texts follow the app language.

## Capabilities and Constraints

Confirmed for the interface:

- Item handling: mark done, snooze/remind later, dismiss as unimportant; these must use the same watch_state/reminders semantics as the watch service.
- Jarvis proposes next steps per item type: reply suggestions with several alternatives, reactions, a vote choice for polls, and additional context pulled from other chats or memory. The set of item types and their modes is open and should be intuitive.
- Existing admin functions stay: first-run setup wizard, settings with validation and automatic rollback, WhatsApp linking (QR / pairing code), logs, maintenance, versions.
- Settings responses mask secrets; explicit reveal and rotation re-ask the owner password. The mobile connection QR carries only a server URL. MCP is introduced during setup and remains discoverable under System → Verbindungen.

Open decisions:

- How reply suggestions are generated (which model, on demand vs. precomputed) and whether sending requires an extra confirmation step beyond `REQUIRE_CONFIRM`.

## Brand Commitments

- Default assistant name: Jarvis, configurable separately from OWNER_NAME. English and German UI copy; German uses the direct "du" address. A single password belongs to the owner across web, mobile, administration and MCP OAuth. Passwordless QR pairing is disabled in this deployment.
- The owner's name comes from `OWNER_NAME`; nothing in the interface may hardcode a person.

## Evidence on Hand

- No screenshots, testimonials, or usage numbers exist. Development runs with simulated Docker and database (`JARVIS_FAKE_DOCKER=1`); any demonstration content shown there is synthetic and must be labeled as such.

## Product Principles

1. What needs the owner comes first; configuration comes second.
2. Every item arrives with a prepared next step; deciding should take one or two moves.
3. Show where a suggestion comes from (chat, person, date) so the owner can trust it.
4. Private by construction: nothing leaves the Pi except the configured AI calls, and the interface says so where it matters.
5. Understandable for a stranger who installed it yesterday.

## Accessibility & Inclusion

Usable one-handed on a phone and by keyboard on a laptop; no state conveyed by color alone.
