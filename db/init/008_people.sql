-- Personen-Ebene: echter Name/Spitznamen (wenn ein Kontakt anders gespeichert ist) sowie Beziehung und Tonfall. Idempotent.
CREATE TABLE IF NOT EXISTS contact_profiles (
  jid           text PRIMARY KEY,                    -- Kontakt-jid (bei Einzelchats = Chat-jid)
  real_name     text,                                -- echter Name, falls der Kontakt anders gespeichert ist (z.B. "Jonas" für "Heidi")
  aliases       text[] NOT NULL DEFAULT '{}',        -- weitere Namen/Spitznamen, unter denen die Person vorkommt
  relationship  text,                                -- family | partner | close_friend | friend | acquaintance | colleague | club | service | other
  closeness     smallint,                            -- 1 (entfernt) .. 5 (sehr eng)
  formality     text,                                -- du | sie | mixed
  tone          text,                                -- Tonfall, kurz beschrieben
  evidence      text,                                -- Begründung der automatischen Einschätzung
  note          text,
  stats         jsonb,                               -- gemessene Kennzahlen (Nachrichten, Anteil, Länge, Emojis ...)
  confidence    real,
  source        text NOT NULL DEFAULT 'auto',        -- auto | user
  locked        boolean NOT NULL DEFAULT false,      -- vom Nutzer gesetzt: die automatische Einschätzung überschreibt nichts mehr
  profiled_at   timestamptz,
  profiled_msgs integer,                             -- Nachrichtenzahl zum Zeitpunkt der Einschätzung
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_profiles_rel ON contact_profiles (relationship, closeness DESC);

-- Echter Name direkt hinter dem gespeicherten Namen anzeigen, damit Suche und Organizer ihn sehen
CREATE OR REPLACE VIEW v_messages AS
SELECT
  m.id,
  m.chat_jid,
  coalesce(c.name, cc.name, cc.push_name, m.chat_jid)
    || CASE WHEN cpc.real_name IS NOT NULL AND lower(cpc.real_name) <> lower(coalesce(c.name, cc.name, cc.push_name, ''))
            THEN ' (eigentlich ' || cpc.real_name || ')' ELSE '' END   AS chat_name,
  c.is_group                                                   AS chat_is_group,
  m.sender_jid,
  CASE WHEN m.from_me THEN 'Ich'
       ELSE coalesce(sc.name, sc.push_name, m.sender_jid)
            || CASE WHEN cps.real_name IS NOT NULL AND lower(cps.real_name) <> lower(coalesce(sc.name, sc.push_name, ''))
                    THEN ' (eigentlich ' || cps.real_name || ')' ELSE '' END END AS sender_name,
  m.from_me,
  m.ts,
  m.type,
  m.body,
  m.quoted_id,
  m.edited_at,
  m.deleted_at,
  m.tsv
FROM messages m
LEFT JOIN chats    c   ON c.jid   = m.chat_jid
LEFT JOIN contacts cc  ON cc.jid  = m.chat_jid
LEFT JOIN contacts sc  ON sc.jid  = m.sender_jid
LEFT JOIN contact_profiles cpc ON cpc.jid = m.chat_jid
LEFT JOIN contact_profiles cps ON cps.jid = m.sender_jid;

CREATE OR REPLACE VIEW v_chats AS
SELECT
  c.jid,
  coalesce(c.name, ct.name, ct.push_name, c.jid)
    || CASE WHEN cp.real_name IS NOT NULL AND lower(cp.real_name) <> lower(coalesce(c.name, ct.name, ct.push_name, ''))
            THEN ' (eigentlich ' || cp.real_name || ')' ELSE '' END AS name,
  c.is_group,
  c.last_message_at,
  (SELECT count(*) FROM messages m WHERE m.chat_jid = c.jid) AS message_count
FROM chats c
LEFT JOIN contacts ct ON ct.jid = c.jid
LEFT JOIN contact_profiles cp ON cp.jid = c.jid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro')  THEN GRANT SELECT ON contact_profiles TO mcp_ro; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON contact_profiles TO mcp_mem; END IF;
END $$;
