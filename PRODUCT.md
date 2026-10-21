# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A native mobile app is planned later; the web interface must work equally well on phone and laptop today, and its card and action vocabulary should carry over to native without redesign.

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

- Self-hosted on a Raspberry Pi with Docker Compose; the interface is reachable only in the home network (port 8080), never through the Cloudflare tunnel.
- Data lives in Postgres (pgvector): messages, chats, contacts, threads, topics (with event dates and people), suggested_actions, reminders, watch_state (notified, snoozed, dismissed per item key), polls and votes, contact profiles, memory.
- The organizer (optional, OpenAI) sorts messages into threads and topics with summaries, dates, todos, and open questions. Without an OpenAI key everything runs locally and slower, and the organizer is off.
- A scheduled "Watch" (watch service) uses the same item keys and states (`event:<id>:<stage>`, `frage:<chat>:<ts>`, `umfrage:<id>`, `aktion:<id>`, `reminder:<id>`) to decide what to notify.
- Outgoing actions (send, vote, react) go through the `outbox` table and are executed by wa-ingest, with confirmation and an hourly limit configurable.
- Interface language is German.

## Capabilities and Constraints

Confirmed for the interface:

- Item handling: mark done, snooze/remind later, dismiss as unimportant; these must use the same watch_state/reminders semantics as the watch service.
- Jarvis proposes next steps per item type: reply suggestions with several alternatives, reactions, a vote choice for polls, and additional context pulled from other chats or memory. The set of item types and their modes is open and should be intuitive.
- Existing admin functions stay: first-run setup wizard, settings with validation and automatic rollback, WhatsApp linking (QR / pairing code), logs, maintenance, versions.
- Secrets never go to the browser in clear text; sensitive actions re-ask the admin password.

Open decisions:

- How reply suggestions are generated (which model, on demand vs. precomputed) and whether sending requires an extra confirmation step beyond `REQUIRE_CONFIRM`.

## Brand Commitments

- Name: Jarvis. German UI copy, direct "du" address.
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
