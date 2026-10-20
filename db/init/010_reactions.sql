-- Reaktionen (Emojis) auf Nachrichten: pro Nachricht und Reagierendem die aktuelle Reaktion. Idempotent.
CREATE TABLE IF NOT EXISTS message_reactions (
  chat_jid    text NOT NULL,
  message_id  text NOT NULL,
  reactor_jid text NOT NULL,
  emoji       text NOT NULL,
  from_me     boolean NOT NULL DEFAULT false,
  ts          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_jid, message_id, reactor_jid)
);
CREATE INDEX IF NOT EXISTS message_reactions_msg ON message_reactions (chat_jid, message_id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro')  THEN GRANT SELECT ON message_reactions TO mcp_ro;  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN GRANT SELECT ON message_reactions TO mcp_mem; END IF;
END $$;
