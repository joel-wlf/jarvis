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

<p align="center"><a href="https://joel-wlf.github.io/jarvis/">Documentation</a> · <a href="README.de.md">Deutsch</a></p>

Jarvis keeps your WhatsApp archive on a small Linux machine you own, searches it by meaning, and surfaces what needs you: open questions, appointments, tasks, polls. You use it in a web or mobile app, and connect Claude or any MCP client to ask questions about your own conversations.

## Install

You need a 64-bit Linux machine with Docker (a Raspberry Pi 4 with 4 GB works).

```bash
curl -fsSL https://raw.githubusercontent.com/joel-wlf/jarvis/main/install.sh -o install-jarvis.sh
bash install-jarvis.sh
```

The script checks Docker, downloads Jarvis and starts the setup. Then open the address it prints, `http://<your-server>:8081`, and follow the steps in your browser: name it, set your password, link WhatsApp by QR code, done. Prebuilt images for arm64 and amd64 are pulled, nothing is compiled on your machine.

Prefer Compose? `git clone https://github.com/joel-wlf/jarvis.git && cd jarvis && docker compose up -d admin app-web`, then open the same address.

## What you get

- **Search that understands meaning**, not just keywords, across every chat.
- **Cards for what needs you**: questions waiting for an answer, appointments, tasks, open polls, deadlines.
- **Topics across chats** with short summaries, sorted automatically if you enable it.
- **Ask Jarvis** in the app, or from Claude and other AI clients through MCP.
- **Safe actions**: send, vote and react only when you allow it, always with a preview and rate limits.
- **Your hardware, your rules**: external AI is off until you switch it on; excluded chats are never sent.

## How it works

Postgres with pgvector holds your messages. `wa-ingest` links to WhatsApp as a companion device and stores messages as they arrive. `embedder` makes them searchable by meaning, `organizer` (optional) groups them into topics, `mcp-server` exposes search and actions, and `admin` plus `app-web` give you setup and the app on one port.

Details on every part: [documentation](https://joel-wlf.github.io/jarvis/).

## Guides

- [Quickstart](docs/content/docs/en/quickstart.mdx) and [Raspberry Pi notes](docs/content/docs/en/raspberry-pi.mdx)
- [Connect Claude and other MCP clients](docs/content/docs/en/connect-claude.mdx)
- [Security and privacy](docs/content/docs/en/security.mdx)
- [Card types](docs/content/docs/en/card-types.mdx) and [app API](docs/content/docs/en/api.mdx)
- [Contributing](CONTRIBUTING.md)

## Please read

- Jarvis is an independent open-source project. It is **not affiliated with, endorsed by or connected to WhatsApp or Meta**. WhatsApp is a trademark of WhatsApp LLC.
- The WhatsApp connection is **unofficial** (the open-source [Baileys](https://github.com/WhiskeySockets/Baileys) library, as a linked device). It may violate WhatsApp's Terms of Service, **accounts can be restricted or banned**, and it can stop working at any time. Use at your own risk; consider a secondary number.
- If you enable AI features, **message content is sent to the provider you configure** (for example OpenAI), including messages from your contacts. Their terms apply.
- Your archive contains **other people's messages**. You are responsible for handling them lawfully (for example under the GDPR).
- Provided as is, without warranty. See [LICENSE](LICENSE) and the [full disclaimer](https://joel-wlf.github.io/jarvis/en/docs/disclaimer).

## License

MIT, see [LICENSE](LICENSE).
