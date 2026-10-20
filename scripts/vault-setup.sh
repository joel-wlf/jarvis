#!/bin/bash
# Verschlüsselt alle Jarvis-Daten auf dem Pi (LUKS2-Container als Datei /srv/vault.img).
# Läuft AUF DEM PI als normaler Benutzer (mit sudo), interaktiv: das Passwort tippst du selbst ein.
#
# Verschoben und danach sicher überschrieben werden:
#   /var/lib/docker (Datenbank, WhatsApp-Sitzung, Container-Logs), .env, Backups
# Abgeschaltet: der Zram-Writeback und die Swap-Datei /var/swap (sie könnten Klartext aus dem Arbeitsspeicher auf die SD-Karte schreiben).
#
# Danach startet Docker nur, wenn der Container entsperrt ist:  jarvis-unlock
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
[ ! -e "$IMG" ] || die "$IMG existiert schon. Nichts geändert."
[ -f "$PROJECT/.env" ] && [ ! -L "$PROJECT/.env" ] || die ".env ist schon verschoben oder fehlt."
FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$FREE_GB" -gt $((SIZE_GB + 10)) ] || die "Zu wenig freier Platz ($FREE_GB GB frei, $SIZE_GB GB nötig)."

cat <<EOF

Das passiert jetzt:
  1. Backup, dann Jarvis stoppen (ca. 15 bis 20 Minuten offline)
  2. Verschlüsselter Bereich ($SIZE_GB GB) anlegen, du wählst das Passwort
  3. Docker-Daten, .env und Backups dorthin verschieben, Altes überschreiben
  4. Jarvis wieder starten
Nach einem Neustart bleibt Jarvis aus, bis du 'jarvis-unlock' ausführst.
Das Passwort kann niemand zurücksetzen. Speichere es in deinem Passwort-Manager.
EOF
read -r -p "Weiter? (ja/nein) " ANS
[ "$ANS" = "ja" ] || die "Abgebrochen."

say "1/9 cryptsetup installieren"
sudo apt-get install -y cryptsetup

say "2/9 Backup vor der Umstellung"
scripts/backup.sh

say "3/9 Verschlüsselung wählen"
TEST="$(mktemp)"; truncate -s 20M "$TEST"
if echo -n test | sudo cryptsetup luksFormat --batch-mode --type luks2 --cipher xchacha20,aes-adiantum-plain64 --key-size 256 --key-file=- "$TEST" 2>/dev/null; then
  CIPHER="xchacha20,aes-adiantum-plain64"; KEYSIZE=256
  echo "Adiantum (schnell auf dem Pi 4, der keine AES-Hardware hat)"
else
  CIPHER="aes-xts-plain64"; KEYSIZE=512
  echo "AES-XTS (Adiantum nicht verfügbar)"
fi
rm -f "$TEST"

say "4/9 Verschlüsselten Container anlegen (Passwort zweimal eingeben, mit YES bestätigen)"
sudo fallocate -l "${SIZE_GB}G" "$IMG"
sudo chmod 600 "$IMG"
sudo cryptsetup luksFormat --type luks2 --cipher "$CIPHER" --key-size "$KEYSIZE" --pbkdf argon2id --pbkdf-memory 262144 --verify-passphrase "$IMG"
echo "Zum Öffnen noch einmal das Passwort:"
sudo cryptsetup open "$IMG" "$MAPPER"
sudo mkfs.ext4 -q -L jarvisvault "/dev/mapper/$MAPPER"
sudo mkdir -p "$MNT"
sudo mount "/dev/mapper/$MAPPER" "$MNT"
mountpoint -q "$MNT" || die "Container ist nicht eingehängt."

say "5/9 Jarvis und Docker stoppen"
docker compose --profile organizer stop
sudo systemctl stop docker.socket docker

say "6/9 Docker-Daten in den verschlüsselten Bereich kopieren"
sudo mkdir -p "$MNT/docker"
sudo rsync -aHAX --info=progress2 /var/lib/docker/ "$MNT/docker/"
sudo mkdir -p /etc/docker
if [ -s /etc/docker/daemon.json ]; then
  sudo python3 - <<'PY'
import json
p = "/etc/docker/daemon.json"
d = json.load(open(p)); d["data-root"] = "/srv/vault/docker"
json.dump(d, open(p, "w"), indent=2)
PY
else
  echo '{ "data-root": "/srv/vault/docker" }' | sudo tee /etc/docker/daemon.json >/dev/null
fi
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Unit]\nConditionPathIsMountPoint=/srv/vault\n' | sudo tee /etc/systemd/system/docker.service.d/vault.conf >/dev/null
sudo systemctl daemon-reload

say "7/9 .env und Backups verschieben"
sudo mkdir -p "$MNT/secrets" "$MNT/backups"
sudo chown "$ME:$ME" "$MNT/secrets" "$MNT/backups"
cp -p "$PROJECT/.env" "$MNT/secrets/.env"
chmod 600 "$MNT/secrets/.env"
shred -u "$PROJECT/.env"
ln -s "$MNT/secrets/.env" "$PROJECT/.env"
if [ -d "$HOME/jarvis-backups" ] && [ ! -L "$HOME/jarvis-backups" ]; then
  cp -a "$HOME/jarvis-backups/." "$MNT/backups/"
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
