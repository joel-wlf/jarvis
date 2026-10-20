#!/bin/bash
# Entsperrt den verschlüsselten Jarvis-Bereich nach einem Neustart und startet Docker und Jarvis.
# Aufruf auf dem Pi:   jarvis-unlock        (vom Mac:  ssh -t <benutzer>@<pi-adresse> jarvis-unlock)
set -euo pipefail
[ "$(id -u)" = 0 ] || exec sudo "$0" "$@"

IMG=/srv/vault.img
MAPPER=jarvisvault
MNT=/srv/vault
USER_NAME="${SUDO_USER:-joel}"

if mountpoint -q "$MNT"; then
  echo "Schon entsperrt."
else
  [ -e "/dev/mapper/$MAPPER" ] || cryptsetup open "$IMG" "$MAPPER"
  mount "/dev/mapper/$MAPPER" "$MNT"
fi

systemctl start docker
cd "/home/$USER_NAME/jarvis"
sudo -u "$USER_NAME" docker compose --profile organizer up -d
echo "Jarvis läuft."
