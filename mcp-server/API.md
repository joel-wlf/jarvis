# Jarvis API (mcp-server)

One server, port 3000 (published to the host for the Cloudflare tunnel), plus an internal port 3001 (docker network only).
Types: `packages/contract/src/api.ts` and `cards.ts`. Tests: `npm test` (PGlite runs every `db/init/*.sql`).

## OAuth 2.1 (MCP SDK `mcpAuthRouter`, Postgres-backed provider)

| Endpoint | |
|---|---|
| `GET /.well-known/oauth-authorization-server` | metadata, issuer = `APP_PUBLIC_URL` |
| `GET /.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource` | resource metadata, resource = `<APP_PUBLIC_URL>/mcp` |
| `POST /register` | dynamic client registration (public clients with PKCE, or client_secret) |
| `GET /authorize` | consent page (owner password), German or English by Accept-Language |
| `POST /oauth/decision` | form post from the consent page (allow/deny), limited like login |
| `POST /token` | `authorization_code` (PKCE S256) and `refresh_token` (rotating) |
| `POST /revoke` | access or refresh token |

Access tokens live 1 hour, refresh tokens 30 days. Only hashes are stored.

## MCP

`POST /mcp` accepts an OAuth bearer token. With `MCP_LEGACY_TOKEN=true` (default) the static `MCP_TOKEN` keeps working as
`Authorization: Bearer <MCP_TOKEN>` and as `/t/<MCP_TOKEN>/mcp`. Without valid credentials: 401 with
`WWW-Authenticate: Bearer resource_metadata=...`, so Claude starts the OAuth flow from the base URL alone.

## App API `/api/v1`

No auth: `GET /info`, `POST /pair`, `POST /login`. Everything else: `Authorization: Bearer <device token "jd_..." or OAuth access token>`.

`GET /devices`, `DELETE /devices/:id` (device id, or an OAuth client id: revokes all its tokens),
`GET /home`, `GET /cards?group=`, `POST /cards/:key/act`, `PUT /cards/:key/priority` `{ priority: 1 | 2 | 3 | null }`, `POST /cards/:key/suggest` (`?refresh=1` skips the cache),
`GET /people?q=`, `GET /people/:jid`, `PATCH /people/:jid`,
`GET /memories?q=&scope=&active=all`, `POST /memories`, `PATCH /memories/:id`, `DELETE /memories/:id`,
`POST /ask` (SSE), `GET /events` (SSE).

Card keys are the watch service keys (`frage:<jid>:<ts>`, `umfrage:<id>`, `event:<id>:<stage>`, `konflikt:<a>:<b>`,
`reminder:<id>`, `aktion:<id>`, `digest:<jid>:<date>`, `person:<jid>`, organizer keys from the `cards` table), so
dismissing or snoozing in the app and via Claude's `watch_feedback` is the same. `act` writes:
done/dismiss/snooze → `watch_state` (or `reminders`, `suggested_actions`, `cards.status` for those card kinds),
remind → `reminders` (ref = card key), send/react/vote → `outbox` (same limits and offline check as the MCP tools).

MCP: the same feed is available to Claude as `list_cards`, `get_card` (data plus the background of `GET /cards/:key/context`)
and `act_on_card` (runs a suggestion through the same `act` function as `POST /cards/:key/act`; steps that send or vote
follow `REQUIRE_CONFIRM` and `ENABLE_ACTIONS`). `get_dashboard` is built from `listCards` too, in its original shape.

Importance: `PUT /cards/:key/priority` stores the owner's choice in `watch_state.priority` (3 important, 2 normal, 1 later,
`null` = Jarvis decides; migration `016_card_priority.sql`). The card list returns it as `urgency` and sorts by urgency, then by
`dueAt`. The watch service (`get_dashboard`) follows it: important items are always in `to_notify` while new, items set to
later never. Event keys store it per event (`event:<id>`), so it survives the stage change. The MCP tool `watch_feedback`
sets it too (`action: priority`, `level: wichtig | normal | spaeter | standard`).

Failed passwords, pairing codes and bearer tokens are counted per client IP (`cf-connecting-ip`): 10 per 15 minutes,
then 429. Password and pairing code checks are refused while blocked; a valid high-entropy token is never locked out.

## Internal (port 3001, header `x-jarvis-internal-secret: <ADMIN_INTERNAL_SECRET>`, refused with Cloudflare headers)

- `POST /internal/pairing-codes` `{ homeUrl? }` → `{ code, expiresAt, payload: PairingPayload, qr: "jarvis:{...}" }` (10 minutes, single use)
- `PUT /internal/owner-password` `{ password }` (10 to 200 characters) → 204

## Settings

`APP_PUBLIC_URL`, `ADMIN_INTERNAL_SECRET`, `MCP_LEGACY_TOKEN` (default true), `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`APP_MODEL` (default gpt-4.1-mini). See `admin/src/schema.ts`.

## Where the server differs from the contract

- `Relationship` `club` is stored as `community` (the value the MCP tools use) and mapped both ways.
- `CardAction` `open` and `save_contact` are app-side; the server answers 400.
- `MemoryScope` `thread` cannot be created or set from the app (the contract has no thread id); such memories are listed.
- `PollData.voted` carries the number of votes so far (as a string); poll cards only exist while the owner has not voted.
- Snoozing a reminder card moves the reminder (`removed: false`, it stays as `scheduled`).
- Not in the contract: `?refresh=1` on suggest, `?active=all` on memories, and the internal endpoints above.
