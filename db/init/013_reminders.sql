-- Erinnerungen von Joel und Rückmeldungen an den Wachdienst (Scheduled Task).
-- Idempotent; auf bestehenden Datenbanken manuell anwenden.
CREATE TABLE IF NOT EXISTS reminders (
  id          serial PRIMARY KEY,
  text        text NOT NULL,
  due_at      timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fired', 'done', 'cancelled')),
  ref         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  fired_at    timestamptz
);
CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (due_at) WHERE status = 'open';

-- Pro Meldeschlüssel des Wachdienstes (z.B. "event:12:vortag", "frage:<chat_jid>:<ts>", "umfrage:<id>"):
-- wann zuletzt gemeldet, bis wann zurückgestellt, ob dauerhaft als unwichtig markiert.
-- Ein Schlüssel ohne Zusatz gilt auch als Präfix, z.B. "frage:<chat_jid>" für alle Fragen aus diesem Chat.
CREATE TABLE IF NOT EXISTS watch_state (
  key              text PRIMARY KEY,
  last_notified_at timestamptz,
  snoozed_until    timestamptz,
  dismissed        boolean NOT NULL DEFAULT false,
  note             text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_ro') THEN
    GRANT SELECT ON reminders, watch_state TO mcp_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN
    GRANT SELECT ON reminders, watch_state TO mcp_mem;
    GRANT INSERT, UPDATE, DELETE ON reminders, watch_state TO mcp_mem;
    GRANT USAGE ON SEQUENCE reminders_id_seq TO mcp_mem;
  END IF;
END $$;
