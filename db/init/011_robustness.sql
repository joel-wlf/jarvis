-- Robustheit: Aufträge zurückziehen können (Zeitüberschreitung) und ähnliche Namen vorschlagen. Idempotent.

-- Nicht ausgeführte Aufträge dürfen vom MCP-Server als "cancelled" markiert werden (kein anderes Recht)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_act') THEN
    GRANT UPDATE (status, error, done_at) ON outbox TO mcp_act;
  END IF;
END $$;

-- Lautähnlichkeit (Spracheingabe: "Stefan" statt "Stephan")
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
