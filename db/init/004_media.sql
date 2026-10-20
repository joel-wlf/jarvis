-- Bildbeschreibung per Vision-Modell (wa-ingest, images.ts). Idempotent.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_status   text;      -- NULL = offen | done | failed | skipped
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_attempts smallint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS messages_images_todo ON messages (ts DESC)
  WHERE type = 'image' AND media_status IS NULL AND raw IS NOT NULL;
