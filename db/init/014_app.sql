-- Jarvis app API: owner login, paired devices, OAuth 2.1 for MCP clients, typed cards and cached reply suggestions.
-- Idempotent; apply manually on existing databases. Secrets are stored only as hashes (sha256 for tokens, scrypt for the password).

-- Single row: the owner's password for the app login and the OAuth authorize page.
CREATE TABLE IF NOT EXISTS app_owner (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL,                       -- scrypt$N$r$p$salt_b64$hash_b64
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Paired app installations (QR pairing or password login). The token is shown once, only its hash is kept.
CREATE TABLE IF NOT EXISTS devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   text NOT NULL UNIQUE,
  name         text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS devices_active ON devices (created_at DESC) WHERE revoked_at IS NULL;

-- Short-lived, single-use pairing codes created by the admin service (home network only).
CREATE TABLE IF NOT EXISTS pairing_codes (
  code_hash  text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  device_id  uuid REFERENCES devices (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- OAuth 2.1 dynamic client registration (RFC 7591). `metadata` is the full client information document.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     text PRIMARY KEY,
  secret_hash   text,                                -- NULL for public clients (PKCE only)
  metadata      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

-- Authorization codes: single use, a few minutes, bound to client, redirect URI and PKCE challenge.
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash      text PRIMARY KEY,
  client_id      text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  scopes         text[] NOT NULL DEFAULT '{}',
  resource       text,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Access and refresh tokens. One row per grant; refresh rotates both hashes in place.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  access_hash        text NOT NULL UNIQUE,
  refresh_hash       text UNIQUE,
  scopes             text[] NOT NULL DEFAULT '{}',
  resource           text,
  access_expires_at  timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_tokens_client ON oauth_tokens (client_id) WHERE revoked_at IS NULL;

-- Typed cards produced by the organizer (types in packages/contract ORGANIZER_CARD_TYPES).
-- Other card types are derived live from SQL by the API and never stored here.
CREATE TABLE IF NOT EXISTS cards (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,
  key        text NOT NULL UNIQUE,                   -- stable, e.g. "parcel:<thread_id>"; also the watch_state key
  payload    jsonb NOT NULL,                         -- Card without key/type/state (title, source, say, suggestions, data, ...)
  due_at     timestamptz,
  chat_jid   text,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cards_open ON cards (due_at NULLS LAST) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS cards_chat ON cards (chat_jid) WHERE chat_jid IS NOT NULL;

-- Cached reply suggestions per card; `basis` fingerprints the chat state so a new message invalidates the cache.
CREATE TABLE IF NOT EXISTS reply_suggestions (
  card_key    text PRIMARY KEY,
  basis       text NOT NULL,
  suggestions jsonb NOT NULL,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro') THEN
    GRANT SELECT ON cards, reply_suggestions TO mcp_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_owner, devices, pairing_codes, oauth_clients, oauth_codes, oauth_tokens, cards, reply_suggestions TO mcp_mem;
    GRANT USAGE ON SEQUENCE cards_id_seq TO mcp_mem;
  END IF;
END $$;
