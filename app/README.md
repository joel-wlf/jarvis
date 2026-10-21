# Jarvis app

One Expo codebase for iOS, Android and web. It connects to your own Jarvis server (pairing QR code, or server address plus owner password) and shows what needs you today, the people Jarvis knows, its memory, a streamed "Ask Jarvis" conversation, and, on your home network, the system administration.

## Run

```bash
npm install
npm run web:mock          # web with sample data, no server needed
npx expo start            # then press i / a for the iOS simulator or Android emulator (Expo Go)
```

Mock mode serves the synthetic fixtures from `packages/contract/src/fixtures.ts`. It is on when `EXPO_PUBLIC_JARVIS_MOCK=1` is set, or after tapping "Try without a server" on the connect screen.

Checks:

```bash
npx tsc --noEmit
npx expo-doctor
```

## Layout

- `src/app/` – routes (Expo Router). `(main)/` holds the screens with navigation (Today, People, Memory, System); `ask`, `connect` and `setup` are full-screen.
- `src/api/` – `client.ts` (app API `/api/v1`, typed by `@jarvis/contract`), `admin.ts` (admin interface on the home network), `mock.ts` / `adminMock.ts` (in-memory versions), `http.ts` (fetch, errors, SSE).
- `src/components/` – the visual language of the approved prototype (`.impeccable/mocks/prototype`): `ui.tsx` primitives, `cards/` (all 30 card types), `jarvis/` (figure, floor, subtitle), `today/`, `system/`.
- `src/theme/` – colour, type and layout tokens. Sharp corners, hairlines, thin italic Urbanist (bundled in `assets/fonts`), group colours only as small marks.
- `locales/de.json`, `locales/en.json` – UI text. The device language picks the locale; German is the default.

`@jarvis/contract` is imported straight from `../packages/contract/src` (see `metro.config.js` and the `paths` in `tsconfig.json`), so there is no build step for the shared types.

## Jarvis figure

Rendered figures go to `assets/jarvis/{state}.png` (`idle`, `listening`, `thinking`, `speaking`, `notify`, `happy`, `sleep`, `error`) and are registered in `src/components/jarvis/images.ts`. Until then the pebble placeholder from the prototype is drawn.

## System area

The System tab appears only when the admin interface (the `homeUrl` from the pairing code, or the page's own origin on web) answers `/healthz`. It signs in with the admin password and uses the existing admin endpoints in `admin/src/server.ts`.
