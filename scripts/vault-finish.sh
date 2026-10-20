#!/bin/bash
# Setzt vault-setup.sh ab Schritt 7 (Backups) fort. Nur nötig, wenn das Hauptskript dort abgebrochen ist.
set -euo pipefail

IMG=/srv/vault.img
MAPPER=jarvisvault
MNT=/srv/vault
SIZE_GB="${SIZE_GB:-24}"
PROJECT="$HOME/jarvis"
ME="$(id -un)"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { echo "ABBRUCH: $*" >&2; exit 1; }

[ "$(id -u)" != 0 ] || die "Bitte als normaler Benutzer starten (nicht als root)."
cd "$PROJECT"
sudo -v

mountpoint -q "$MNT" || die "$MNT ist nicht eingehängt (erst jarvis-unlock-Schritte: cryptsetup open)."
[ -L "$PROJECT/.env" ] || die ".env ist noch nicht im verschlüsselten Bereich."
[ -d "$MNT/docker" ] && [ -d "$MNT/backups" ] || die "Verschlüsselter Bereich unvollständig."
say "Rest der Schritte 7 (alte Backups sicher entfernen)"
if [ -d "$HOME/jarvis-backups" ] && [ ! -L "$HOME/jarvis-backups" ]; then
  sudo find "$HOME/jarvis-backups" -type f -exec shred -u {} +
  sudo rm -rf "$HOME/jarvis-backups"
fi
ln -sfn "$MNT/backups" "$HOME/jarvis-backups"

say "8/9 Docker neu starten (jetzt aus dem verschlüsselten Bereich) und prüfen"
sudo systemctl start docker
ROOT="$(docker info --format '{{.DockerRootDir}}')"
[ "$ROOT" = "$MNT/docker" ] || die "Docker nutzt $ROOT statt $MNT/docker. Altes bleibt unangetastet, bitte melden."
docker compose --profile organizer up -d
echo "Warte auf die Datenbank ..."
for i in $(seq 1 40); do
  docker compose exec -T postgres pg_isready -U jarvis -d jarvis >/dev/null 2>&1 && break
  sleep 3
done
docker compose exec -T postgres pg_isready -U jarvis -d jarvis >/dev/null || die "Datenbank startet nicht. Altes bleibt unangetastet (/var/lib/docker), bitte melden."
N=$(docker compose exec -T postgres psql -U jarvis -d jarvis -At -c "select count(*) from messages")
echo "Nachrichten in der Datenbank: $N"
[ "${N:-0}" -gt 1000 ] || die "Unerwartet wenige Nachrichten. Altes bleibt unangetastet, bitte melden."

say "9/9 Alte Klartext-Daten überschreiben, Swap abschalten, Entsperr-Befehl installieren"
sudo find /var/lib/docker/volumes /var/lib/docker/containers -type f -size +0 -exec shred -n 1 -u {} + 2>/dev/null || true
sudo rm -rf /var/lib/docker
sudo mkdir -p /var/lib/docker   # leer; Docker startet ohne Container-Bereich nicht von hier
sudo systemctl disable --now rpi-zram-writeback.timer 2>/dev/null || true
sudo systemctl disable --now 'rpi-setup-loop@var-swap.service' 2>/dev/null || true
[ ! -e /var/swap ] || sudo shred -n 1 -u /var/swap
sudo install -m 755 "$PROJECT/scripts/jarvis-unlock.sh" /usr/local/bin/jarvis-unlock

echo
echo "Fertig. Jarvis läuft jetzt aus dem verschlüsselten Bereich."
echo "Nach jedem Neustart:  ssh -t $ME@<pi> jarvis-unlock"
echo "Hinweis: Die SD-Karte kann alte Klartext-Reste an unbenutzten Stellen behalten. Siehe README, Abschnitt Diebstahlschutz."
