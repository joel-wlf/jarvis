-- Chatübergreifende Themen (organizer, Stufe 2): fasst Threads aus mehreren Chats zu einem Thema zusammen. Idempotent.
CREATE TABLE IF NOT EXISTS topics (
  id                bigserial PRIMARY KEY,
  title             text NOT NULL,
  summary           text,
  status            text NOT NULL DEFAULT 'open',   -- open | resolved | cancelled | past (Termin vorbei) | stale (länger ohne Aktivität)
  status_reason     text,
  event_at          timestamptz,                    -- Termin, falls das Thema eine Veranstaltung ist
  first_activity_at timestamptz,
  last_activity_at  timestamptz,
  thread_count      integer NOT NULL DEFAULT 0,
  chat_count        integer NOT NULL DEFAULT 0,
  facts             jsonb,                          -- {people:[{name,state,note}], open_questions:[...]}
  embedding         vector(384),
  model             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topics_status_activity ON topics (status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS topics_embedding_hnsw  ON topics USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS topics_to_embed        ON topics (id) WHERE embedding IS NULL;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS topic_id      bigint;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS linked_at     timestamptz;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS link_attempts smallint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS threads_topic ON threads (topic_id) WHERE topic_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro') THEN
    GRANT SELECT ON topics TO mcp_ro;
  END IF;
END $$;
