# @jarvis/contract

Shared TypeScript types for everything that talks to the Jarvis app API:

- `src/cards.ts`: the card model. Every card is one decision for the owner, with its source, a sentence in Jarvis' voice, and prepared suggestions. There are 22 card types in four groups (`reply`, `schedule`, `todo`, `know`).
- `src/api.ts`: request and response types of `/api/v1` (pairing, login, home, cards, people, memories, ask, live events) and the pairing QR payload.
- `src/fixtures.ts`: synthetic sample data for the app's mock mode, tests and demos.

The API (`mcp-server`), the organizer and the Expo app (`app/`) all build against these types. When you change the contract, change all three.

```bash
npm install
npm run check
```
