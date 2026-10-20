#!/bin/bash
# Rolle mcp_mem: darf nur Gedächtnis und manuelle Korrekturen schreiben (kein Löschen von Nachrichten, kein Senden).
# Idempotent; läuft beim ersten Start und kann auf bestehenden Datenbanken nachträglich ausgeführt werden.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_mem') THEN
      CREATE ROLE mcp_mem LOGIN PASSWORD '${MCP_RO_PASSWORD}';
    END IF;
  END \$\$;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO mcp_mem;
  GRANT USAGE ON SCHEMA public TO mcp_mem;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_mem;
  GRANT USAGE ON SEQUENCE memories_id_seq, topics_id_seq TO mcp_mem;
  -- Gedächtnis
  GRANT INSERT, UPDATE, DELETE ON memories TO mcp_mem;
  -- Korrekturen an Themen/Threads (Spaltenrechte, nichts darüber hinaus)
  GRANT INSERT, DELETE ON topics TO mcp_mem;
  GRANT UPDATE (title, summary, status, status_reason, event_at, facts, locked, embedding, first_activity_at, last_activity_at, thread_count, chat_count, updated_at) ON topics TO mcp_mem;
  GRANT UPDATE (topic_id, linked_at, link_locked, link_attempts, started_at, ended_at, message_count, participants, embedding, updated_at) ON threads TO mcp_mem;
  GRANT UPDATE (thread_id, embedding) ON messages TO mcp_mem;
  GRANT UPDATE (status) ON suggested_actions TO mcp_mem;
  ALTER ROLE mcp_mem SET statement_timeout = '15s';
EOSQL
