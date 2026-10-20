#!/bin/bash
# Trägt den OpenAI-Schlüssel sicher ein: verdeckte Eingabe, Format- und Live-Prüfung, dann Neustart der betroffenen Dienste.
# Aufruf auf dem Pi:  ~/jarvis/scripts/set-openai-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."
read -rsp "OpenAI-API-Key (beginnt mit sk-): " K
echo
K="$(printf '%s' "$K" | tr -d '[:space:]')"
case "$K" in
  sk-*) ;;
  *) echo "Abbruch: Das sieht nicht wie ein OpenAI-Schlüssel aus (er muss mit sk- beginnen). Nichts wurde gespeichert."; exit 1 ;;
esac
code="$(curl -s -o /dev/null -w '%{http_code}' https://api.openai.com/v1/models -H "Authorization: Bearer $K")"
if [ "$code" != "200" ]; then
  echo "Abbruch: OpenAI lehnt den Schlüssel ab (HTTP $code). Nichts wurde gespeichert."
  exit 1
fi
touch .env && chmod 600 .env
grep -v '^OPENAI_API_KEY=' .env > .env.tmp || true
printf 'OPENAI_API_KEY=%s\n' "$K" >> .env.tmp
mv .env.tmp .env && chmod 600 .env
echo "Schlüssel geprüft und gespeichert. Starte Dienste neu ..."
docker compose up -d embedder wa-ingest
