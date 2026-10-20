CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Kleine Key/Value-Tabelle, z.B. eigene JID des verknüpften WhatsApp-Accounts
CREATE TABLE meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE contacts (
  jid        text PRIMARY KEY,
  name       text,          -- Name aus dem Adressbuch
  push_name  text,          -- Name, den die Person selbst gesetzt hat
  phone      text,
  is_group   boolean NOT NULL DEFAULT false,
  raw        jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chats (
  jid             text PRIMARY KEY,
  name            text,
  is_group        boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  unread          integer,
  archived        boolean,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_participants (
  chat_jid text NOT NULL,
  jid      text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chat_jid, jid)
);

CREATE TABLE messages (
  id         text NOT NULL,
  chat_jid   text NOT NULL,
  sender_jid text,
  from_me    boolean NOT NULL DEFAULT false,
  ts         timestamptz NOT NULL,
  type       text NOT NULL,           -- text, image, video, audio, document, sticker, location, contact, poll, reaction, other
  body       text,
  quoted_id  text,
  media_meta jsonb,
  raw        jsonb,                   -- Umfragen (Stimmen), Medien (Schlüssel zum Download, ohne Vorschaubild)
  edited_at  timestamptz,
  deleted_at timestamptz,
  transcript_status   text,           -- nur Audio: pending | done | failed | skipped
  transcript_attempts integer NOT NULL DEFAULT 0,
  tsv        tsvector GENERATED ALWAYS AS (to_tsvector('german', coalesce(body, ''))) STORED,
  embedding  vector(384),             -- multilingual-e5-small (Dienst "embedder"), NULL = noch nicht berechnet
  PRIMARY KEY (chat_jid, id)
);

CREATE INDEX messages_tsv_idx   ON messages USING gin (tsv);
CREATE INDEX messages_trgm_idx  ON messages USING gin (body gin_trgm_ops);
CREATE INDEX messages_chat_ts   ON messages (chat_jid, ts DESC);
CREATE INDEX messages_ts        ON messages (ts DESC);
CREATE INDEX messages_sender    ON messages (sender_jid);
CREATE INDEX messages_type_ts   ON messages (type, ts DESC);
-- Semantische Suche (Cosinus-Abstand) und Warteschlange für den embedder
CREATE INDEX messages_embedding_hnsw ON messages USING hnsw (embedding vector_cosine_ops);
CREATE INDEX messages_to_embed ON messages (ts DESC) WHERE embedding IS NULL AND body IS NOT NULL;
CREATE INDEX messages_pending_audio ON messages (ts DESC) WHERE transcript_status = 'pending';

CREATE TABLE poll_votes (
  chat_jid    text NOT NULL,
  poll_msg_id text NOT NULL,
  voter_jid   text NOT NULL,
  options     text[] NOT NULL,
  ts          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_jid, poll_msg_id, voter_jid)
);

-- Aufträge des MCP-Servers an wa-ingest (Nachricht senden, abstimmen ...). Dient zugleich als Protokoll.
CREATE TABLE outbox (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,           -- send_text | react | vote | create_poll
  chat_jid   text NOT NULL,
  payload    jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'pending',   -- pending | sending | done | failed
  result     jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz
);
CREATE INDEX outbox_pending ON outbox (id) WHERE status = 'pending';

-- Vorbereitet für den späteren Kontext-/Gedächtnis-Service (noch ungenutzt)
CREATE TABLE memories (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,           -- fact, preference, person, event ...
  content    text NOT NULL,
  source_msg jsonb,                   -- [{chat_jid, id}]
  embedding  vector(384),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE suggested_actions (
  id         bigserial PRIMARY KEY,
  title      text NOT NULL,
  detail     text,
  due_at     timestamptz,
  status     text NOT NULL DEFAULT 'open',
  source_msg jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lesbare Namen für Chats/Absender; die MCP-Tools lesen nur über diese View.
CREATE VIEW v_messages AS
SELECT
  m.id,
  m.chat_jid,
  coalesce(c.name, cc.name, cc.push_name, m.chat_jid)          AS chat_name,
  c.is_group                                                   AS chat_is_group,
  m.sender_jid,
  CASE WHEN m.from_me THEN 'Ich'
       ELSE coalesce(sc.name, sc.push_name, m.sender_jid) END  AS sender_name,
  m.from_me,
  m.ts,
  m.type,
  m.body,
  m.quoted_id,
  m.edited_at,
  m.deleted_at,
  m.tsv
FROM messages m
LEFT JOIN chats    c  ON c.jid  = m.chat_jid
LEFT JOIN contacts cc ON cc.jid = m.chat_jid
LEFT JOIN contacts sc ON sc.jid = m.sender_jid;

CREATE VIEW v_chats AS
SELECT
  c.jid,
  coalesce(c.name, ct.name, ct.push_name, c.jid) AS name,
  c.is_group,
  c.last_message_at,
  (SELECT count(*) FROM messages m WHERE m.chat_jid = c.jid) AS message_count
FROM chats c
LEFT JOIN contacts ct ON ct.jid = c.jid;
