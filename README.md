<p align="center">
  <img src="app/assets/jarvis/idle_a.png" width="220" alt="Jarvis, a round white companion in a hat with a dark visor">
</p>

<h1 align="center">Jarvis</h1>

<p align="center"><em>A private context manager that turns your messages into decisions.<br>Self-hosted. Your data stays on your hardware.</em></p>

<p align="center">
  <a href="https://github.com/joel-wlf/jarvis/actions/workflows/ci.yml"><img src="https://github.com/joel-wlf/jarvis/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-121416" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/runs%20on-Raspberry%20Pi%20%C2%B7%20arm64%20%C2%B7%20amd64-121416" alt="Runs on Raspberry Pi, arm64 and amd64">
  <img src="https://img.shields.io/badge/app-iOS%20%C2%B7%20Android%20%C2%B7%20Web-121416" alt="App for iOS, Android and web">
</p>

<p align="center">
  English · <a href="README.de.md">Deutsch</a> · <a href="https://joel-wlf.github.io/jarvis/">Documentation</a>
</p>

> **Important**
>
> - Jarvis is an independent open-source project. It is **not affiliated with, endorsed by or connected to WhatsApp or Meta**. WhatsApp is a trademark of WhatsApp LLC.
> - The WhatsApp connection is **unofficial** (the open-source [Baileys](https://github.com/WhiskeySockets/Baileys) library, acting as a linked device). It may violate WhatsApp's Terms of Service, **WhatsApp can restrict or ban accounts** that use unofficial clients, and the connection can stop working at any time. Use at your own risk; consider a secondary number.
> - If you enable AI features, **message content is sent to the AI provider you configure** (for example OpenAI): text, voice message transcripts, image descriptions and surrounding context, including messages from your contacts. That provider's terms and privacy policy apply. Excluded chats and redaction limit what is sent; without an API key, processing stays local with fewer features.
> - Your archive contains **other people's messages**. You are responsible for handling their data lawfully (for example under the GDPR).
> - Provided as is, without warranty. See [LICENSE](LICENSE) and the [disclaimer](https://joel-wlf.github.io/jarvis/en/docs/disclaimer).

## What it is

Most of what you need to do is buried in chats: a question someone asked two days ago, a date that came up in a group, a poll you forgot to answer, a promise to reply. Jarvis collects that context, sorts it by topics, people and deadlines, and shows you **what needs you right now**, each item with prepared next steps: reply options in your own tone, a vote, a reminder, a reaction.

Today WhatsApp is the first source. The architecture separates capture, understanding and access, so mail, calendar, documents and notes can follow.

- **One feed of decisions.** 30 card types for different jobs: a question to answer, a voice message with its summary, an event, a double booking, a poll, a parcel on its way, a shopping list assembled from six messages, money someone laid out for you, a promise you made, a birthday, and more.
- **Prepared answers.** Reply suggestions come from the chat, your writing style and what Jarvis knows about the person. You tap, it sends.
- **Remembers corrections.** Tell Jarvis once that your mother prefers short texts; it keeps that, per person, chat or topic.
- **Works with Claude.** An OAuth-protected MCP server lets Claude search, remind, prepare and act on your archive.
- **Ask Jarvis.** Ask in plain language, get an answer with its sources.
- **Private by construction.** Everything runs on your own Raspberry Pi or server. The admin area is only reachable on your home network.

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/joel-wlf/jarvis/main/install.sh | sh
```

The installer shows the notices above and asks for confirmation, installs Docker if needed, pulls the prebuilt images (arm64 and amd64), starts Jarvis and prints the setup address and code. Then:

1. Open the address in a browser and finish the setup wizard (name, AI provider, privacy, remote access).
2. Link WhatsApp with the QR code shown in the browser.
3. Install the app or open the web app and pair it by scanning the code in **System → Devices and access**.
4. Optional: add `https://<your-address>` as a connector in Claude. It signs in with OAuth, no token in the URL.

Prefer to build from source or run it by hand? See the [quickstart](https://joel-wlf.github.io/jarvis/en/docs/quickstart).

## How it fits together

```
WhatsApp ──> wa-ingest ──> postgres + pgvector <── mcp-server <── tunnel ── Claude, app
                               ^                      (OAuth, app API)
                  embedder, organizer
                 (vectors, threads, topics, cards)
```

| Part | What it does |
|---|---|
| `wa-ingest` | Linked-device client. Imports history, stores messages live, transcribes voice messages, sends what you approve. |
| `postgres` | Postgres 16 with pgvector: messages, people, topics, cards, memory. |
| `embedder` | Embeddings for semantic search (local model by default). |
| `organizer` | Optional. Sorts messages into threads and topics and produces the typed cards. |
| `mcp-server` | MCP for Claude, the OAuth server and the app API (`/api/v1`). |
| `admin` | Setup wizard, settings with rollback, logs, maintenance. Serves the web app. Home network only. |
| `app/` | The Expo app for iOS, Android and web. |
| `packages/contract` | Shared TypeScript types between server, organizer and app. |

## Running on a Raspberry Pi

A Pi 4 with 4 GB and an SSD is enough. Memory limits and cooling advice are in the [Raspberry Pi guide](https://joel-wlf.github.io/jarvis/en/docs/raspberry-pi). Sensitive data can sit on an encrypted volume that unlocks only at boot with your passphrase, see [Security](https://joel-wlf.github.io/jarvis/en/docs/security).

## Development

```bash
# server side (Node 22)
cd mcp-server && npm ci && npm test        # OAuth, pairing, cards, API
cd organizer  && npm ci && npm test
cd admin      && npm ci && npm test

# shared types
cd packages/contract && npm ci && npm run check

# app (Expo), runs with sample data and no server
cd app && npm ci && npm run web:mock

# docs (Fumadocs)
cd docs && npm ci && npm run dev
```

Changes to the API shape start in `packages/contract`; the server, the organizer and the app all build against it. More in [Contributing](CONTRIBUTING.md).

## Contributing

Issues and pull requests are welcome, in English or German. Please read the [disclaimer](https://joel-wlf.github.io/jarvis/en/docs/disclaimer) first, and never include real chats, tokens or keys in issues or tests; the repository ships synthetic fixtures for that.

## License

[MIT](LICENSE). Jarvis is not affiliated with WhatsApp, Meta, OpenAI, Anthropic or Cloudflare; all trademarks belong to their owners.
