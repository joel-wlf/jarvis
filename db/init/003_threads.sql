-- Themen-Stränge (vom "organizer" per KI erzeugt). Idempotent: kann auch auf eine bestehende Datenbank angewendet werden.

CREATE TABLE IF NOT EXISTS threads (
  id            bigserial PRIMARY KEY,
  chat_jid      text NOT NULL,
  title         text NOT NULL,
  summary       text,
  status        text NOT NULL DEFAULT 'open',      -- open | resolved | info
  participants  text[],
  started_at    timestamptz,
  ended_at      timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  facts         jsonb,                              -- {events:[...], todos:[...], open_questions:[...]}
  embedding     vector(384),                        -- Embedding von Titel + Zusammenfassung (Dienst "embedder")
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_chat_time   ON threads (chat_jid, ended_at DESC);
CREATE INDEX IF NOT EXISTS threads_status_time ON threads (status, ended_at DESC);
CREATE INDEX IF NOT EXISTS threads_embedding_hnsw ON threads USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS threads_to_embed    ON threads (id) WHERE embedding IS NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id         bigint;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organized_at      timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organize_attempts smallint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_to_organize ON messages (chat_jid, ts)
  WHERE organized_at IS NULL AND body IS NOT NULL;

-- Chats, die nie an die externe KI gehen
CREATE TABLE IF NOT EXISTS organizer_exclusions (
  chat_jid   text PRIMARY KEY,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Verbrauch pro Tag (Sicherung gegen unerwartete Kosten)
CREATE TABLE IF NOT EXISTS organizer_usage (
  day           date PRIMARY KEY,
  calls         integer NOT NULL DEFAULT 0,
  input_tokens  bigint  NOT NULL DEFAULT 0,
  output_tokens bigint  NOT NULL DEFAULT 0
);

-- Vorschläge aus Themen (Termine/Aufgaben)
ALTER TABLE suggested_actions ADD COLUMN IF NOT EXISTS thread_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS suggested_actions_thread_title ON suggested_actions (thread_id, title) WHERE thread_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro') THEN
    GRANT SELECT ON threads, organizer_exclusions, organizer_usage, suggested_actions TO mcp_ro;
  END IF;
END $$;
