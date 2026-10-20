#!/bin/bash
# Tägliches Backup: Datenbank (pg_dump) + WhatsApp-Sitzung (wa-auth). Behält die letzten 14 Stände.
# Aufruf: scripts/backup.sh [Zielordner]   (Standard: ~/jarvis-backups)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${1:-$HOME/jarvis-backups}"
STAMP="$(date +%F_%H%M)"
umask 077
mkdir -p "$DEST"

docker compose exec -T postgres pg_dump -U jarvis -Fc jarvis > "$DEST/db-$STAMP.dump.tmp"
mv "$DEST/db-$STAMP.dump.tmp" "$DEST/db-$STAMP.dump"

# Die Sitzung enthält die Zugangsdaten zu deinem WhatsApp-Konto: Backup-Ordner geschützt halten!
docker run --rm -u "$(id -u):$(id -g)" -v jarvis_wa-auth:/data:ro -v "$DEST":/backup alpine \
  tar czf "/backup/wa-auth-$STAMP.tgz" -C /data .

ls -1t "$DEST"/db-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/wa-auth-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Backup fertig: $DEST ($STAMP)"
