#!/bin/bash
# Trägt den Cloudflare-Tunnel-Token ein und startet den Tunnel. Verdeckte Eingabe, Prüfung vor dem Speichern.
# Aufruf auf dem Pi:  ~/jarvis/scripts/set-tunnel-token.sh
set -euo pipefail
cd "$(dirname "$0")/.."
read -rsp "Cloudflare-Tunnel-Token (oder der ganze Installationsbefehl): " RAW
echo
# Token beginnt mit eyJ (base64 von JSON); auch aus einem eingefügten Befehl herausziehen
T="$(printf '%s' "$RAW" | grep -oE 'eyJ[A-Za-z0-9+/=_-]{20,}' | head -1 || true)"
if [ -z "$T" ] || ! printf '%s' "$T" | base64 -d 2>/dev/null | grep -q '"t"'; then
  echo "Abbruch: Das sieht nicht wie ein Cloudflare-Tunnel-Token aus (er beginnt mit eyJ…). Nichts wurde gespeichert."
  exit 1
fi
touch .env
# Verweis (Tresor) auflösen, damit .env nicht durch eine Klartext-Datei ersetzt wird
ENV_FILE="$(readlink -f .env)"
set_env() { grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true; printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE.tmp"; chmod 600 "$ENV_FILE.tmp"; mv "$ENV_FILE.tmp" "$ENV_FILE"; }
set_env CLOUDFLARE_TUNNEL_TOKEN "$T"
cur="$(grep '^COMPOSE_PROFILES=' "$ENV_FILE" | cut -d= -f2- || true)"
case ",$cur," in *,tunnel,*) ;; *) set_env COMPOSE_PROFILES "${cur:+$cur,}tunnel" ;; esac
echo "Token gespeichert. Starte den Tunnel ..."
docker compose up -d cloudflared 2>&1 | grep -E "Started|Created|Recreate|rror" || true
for i in $(seq 1 15); do
  if docker compose logs --since 1m cloudflared 2>&1 | grep -q "Registered tunnel connection"; then
    echo "Tunnel verbunden. Er leitet an: $(docker compose logs --since 1m cloudflared 2>&1 | grep -o 'service":"[^"]*' | head -1 || true)"
    echo "Jetzt in Cloudflare unter Public Hostname eintragen: Dienst  http://app-web:8084"
    exit 0
  fi
  sleep 2
done
echo "Noch keine Verbindung. Letzte Meldungen:"; docker compose logs --tail 8 cloudflared 2>&1 | cut -c1-200
