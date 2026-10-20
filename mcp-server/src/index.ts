import { createApps } from './server.js'

const TOKEN = process.env.MCP_TOKEN
const LEGACY = process.env.MCP_LEGACY_TOKEN !== 'false'
if (LEGACY && (!TOKEN || TOKEN.length < 32)) {
  console.error('MCP_TOKEN is missing or too short (at least 32 characters, e.g. openssl rand -hex 24). Set MCP_LEGACY_TOKEN=false to use OAuth only.')
  process.exit(1)
}

const port = Number(process.env.PORT ?? 3000)
const publicUrl = new URL(process.env.APP_PUBLIC_URL || `http://localhost:${port}`)
if (!process.env.APP_PUBLIC_URL) console.warn(`APP_PUBLIC_URL is not set; OAuth and the app use ${publicUrl.href}, which only works locally.`)

const { app, internal } = createApps({
  publicUrl,
  mcpToken: TOKEN,
  legacyToken: LEGACY,
  adminSecret: process.env.ADMIN_INTERNAL_SECRET || undefined,
})

app.listen(port, () => console.log(`Jarvis API (MCP, OAuth, app) on :${port}, public URL ${publicUrl.origin}`))

// Internal admin API: only on the docker network (port not published), see docker-compose.yml
const internalPort = Number(process.env.INTERNAL_PORT ?? 3001)
if (process.env.ADMIN_INTERNAL_SECRET) internal.listen(internalPort, () => console.log(`Internal admin API on :${internalPort}`))
