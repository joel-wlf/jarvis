#!/bin/bash
# Legt die Datenbank-Benutzer für den MCP-Server an.
#  mcp_ro  : nur lesen (alle Suchtools)
#  mcp_act : darf nur Aufträge in die Tabelle "outbox" schreiben/lesen (Senden, Abstimmen ...)
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE mcp_ro LOGIN PASSWORD '${MCP_RO_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO mcp_ro;
  GRANT USAGE ON SCHEMA public TO mcp_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_ro;
  ALTER ROLE mcp_ro SET default_transaction_read_only = on;
  ALTER ROLE mcp_ro SET statement_timeout = '15s';

  CREATE ROLE mcp_act LOGIN PASSWORD '${MCP_RO_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO mcp_act;
  GRANT USAGE ON SCHEMA public TO mcp_act;
  GRANT SELECT, INSERT ON outbox TO mcp_act;
  GRANT USAGE ON SEQUENCE outbox_id_seq TO mcp_act;
  ALTER ROLE mcp_act SET statement_timeout = '15s';
EOSQL
