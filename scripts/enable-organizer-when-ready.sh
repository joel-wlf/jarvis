#!/bin/bash
# Wartet, bis die Bildbeschreibung durch ist, und schaltet dann die Themen-Sortierung (organizer) ein.
# Aufruf: nohup ~/jarvis/scripts/enable-organizer-when-ready.sh > ~/organizer-enable.log 2>&1 &
set -uo pipefail
cd "$(dirname "$0")/.."
q() { docker compose exec -T postgres psql -U jarvis -d jarvis -Atc "$1"; }
echo "$(date '+%F %T') Warte auf Ende der Bildbeschreibung ..."
while :; do
  open="$(q "select count(*) from messages where type='image' and media_status is null and raw is not null and media_attempts < 3" 2>/dev/null || echo x)"
  [ "$open" = "0" ] && break
  sleep 60
done
echo "$(date '+%F %T') Bilder durch: $(q "select count(*) filter (where media_status='done') || ' beschrieben, ' || count(*) filter (where media_status='failed' or (media_status is null and media_attempts>=3)) || ' nicht ladbar' from messages where type='image'")"
echo "--- Schätzung"
docker compose --profile organizer run --rm -T organizer node dist/index.js --estimate 2>&1 | grep -v "kernel does not\|Container\|Waiting\|Healthy"
set_env() { grep -v "^$1=" .env > .env.tmp || true; printf '%s=%s\n' "$1" "$2" >> .env.tmp; mv .env.tmp .env; chmod 600 .env; }
set_env ORGANIZER_ENABLED true
cur="$(grep '^COMPOSE_PROFILES=' .env | cut -d= -f2-)"
case ",$cur," in *,organizer,*) ;; *) set_env COMPOSE_PROFILES "${cur:+$cur,}organizer" ;; esac
docker compose --profile organizer up -d organizer 2>&1 | grep -E "Started|Recreate|Created"
echo "$(date '+%F %T') ORGANIZER GESTARTET"
