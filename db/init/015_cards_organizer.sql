-- Cards produced by the organizer (types in ORGANIZER_CARD_TYPES of packages/contract). Idempotent.
-- 014_app.sql (app API) creates the same table with the same columns, indexes and grants; this file only
-- guarantees it exists for the organizer when 014 is not applied. 'expired' is set by the API, never by the organizer.
-- The organizer connects as the database owner, so it needs no extra grants; the read/write roles below do.
CREATE TABLE IF NOT EXISTS cards (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,
  key        text NOT NULL UNIQUE,                 -- stable: type + chat + subject
  payload    jsonb NOT NULL,                       -- full Card object of the contract
  due_at     timestamptz,
  chat_jid   text,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cards_open ON cards (due_at NULLS LAST) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS cards_chat ON cards (chat_jid) WHERE chat_jid IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro')  THEN GRANT SELECT ON cards TO mcp_ro; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO mcp_mem;
    GRANT USAGE ON SEQUENCE cards_id_seq TO mcp_mem;
  END IF;
END $$;
