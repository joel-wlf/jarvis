-- Gedächtnis und manuelle Korrekturen (über den MCP-Server). Idempotent.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS scope       text    NOT NULL DEFAULT 'global';  -- global | chat | topic | thread | contact
ALTER TABLE memories ADD COLUMN IF NOT EXISTS chat_jid    text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS topic_id    bigint;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS thread_id   bigint;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS contact_jid text;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS refs        jsonb;                               -- Verweise: [{"type":"message","ref":"..."},{"type":"topic","id":3}]
ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned      boolean NOT NULL DEFAULT false;      -- immer in den MCP-Anweisungen sichtbar
ALTER TABLE memories ADD COLUMN IF NOT EXISTS active      boolean NOT NULL DEFAULT true;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memories' AND column_name = 'tsv') THEN
    ALTER TABLE memories ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('german', content)) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS memories_tsv        ON memories USING gin (tsv);
CREATE INDEX IF NOT EXISTS memories_scope      ON memories (scope, active);
CREATE INDEX IF NOT EXISTS memories_chat       ON memories (chat_jid) WHERE chat_jid IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_topic      ON memories (topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_embedding  ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memories_to_embed   ON memories (id) WHERE embedding IS NULL AND active;

-- Von Hand gesetzte Zuordnungen sind verbindlich: der organizer überschreibt sie nicht.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS link_locked boolean NOT NULL DEFAULT false;
ALTER TABLE topics  ADD COLUMN IF NOT EXISTS locked      boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro') THEN
    GRANT SELECT ON memories TO mcp_ro;
  END IF;
END $$;
