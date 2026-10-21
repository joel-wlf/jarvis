#!/usr/bin/env bash
# GitHub bootstrap: no separate terminal wizard. All product setup happens in Expo web.
set -euo pipefail
umask 077

usage() {
  cat <<'HELP'
Jarvis für Linux installieren
  bash install.sh [--version REF] [--dir PATH] [--port PORT] [--accept-risks]

Das Skript lädt eine feste GitHub-Commit-Version und startet denselben
Browser-Assistenten wie: docker compose up -d --build admin app-web
Docker wird auf Debian/Ubuntu nur nach deiner ausdrücklichen Auswahl installiert.
Bestehende Installationen werden wieder gestartet, niemals überschrieben.
HELP
}
ref=main
install_dir="${JARVIS_INSTALL_DIR:-$HOME/jarvis}"
port="${APP_WEB_PORT:-8081}"
accept=0
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --accept-risks) accept=1; shift ;;
    --version|--dir|--port)
      (($# >= 2)) || { usage >&2; exit 2; }
      case "$1" in --version) ref=$2 ;; --dir) install_dir=$2 ;; --port) port=$2 ;; esac
      shift 2 ;;
    *) printf 'Unbekannte Option: %s\n' "$1" >&2; exit 2 ;;
  esac
done
[[ $(uname -s) == Linux ]] || { printf 'Dieses Skript unterstützt Linux. Auf anderen Systemen Docker Compose verwenden.\n' >&2; exit 1; }
[[ $port =~ ^[0-9]{4,5}$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) || { printf 'Ungültiger Port. Erlaubt: 1024–65535.\n' >&2; exit 2; }
[[ $ref =~ ^[A-Za-z0-9._/-]+$ && $ref != -* ]] || { printf 'Ungültige GitHub-Version.\n' >&2; exit 2; }
[[ $(getconf LONG_BIT) == 64 ]] || { printf 'Jarvis benötigt ein 64-bit Linux-System.\n' >&2; exit 1; }
for dependency in curl tar df; do
  command -v "$dependency" >/dev/null || { printf 'Bitte zuerst %s installieren.\n' "$dependency" >&2; exit 1; }
done
ask() {
  local answer
  printf '%s [j/N] ' "$1" >/dev/tty
  read -r answer </dev/tty
  [[ $answer == j || $answer == J || $answer == ja ]]
}
disclaimer_url="${JARVIS_DISCLAIMER_URL:-https://joel-wlf.github.io/jarvis/docs/disclaimer}"
printf '\nWichtige Hinweise, bitte vor der Installation lesen:\n\n'
printf '%s\n\n' 'Jarvis ist ein unabhängiges Projekt und steht in keiner Verbindung zu WhatsApp oder Meta und wird von ihnen nicht unterstützt.'
printf '%s\n\n' 'Jarvis verbindet sich über ein inoffizielles Verfahren (Baileys, als verknüpftes Gerät) mit WhatsApp. Das kann gegen die Nutzungsbedingungen von WhatsApp verstoßen; WhatsApp kann dein Konto einschränken oder sperren, und die Verbindung kann jederzeit nicht mehr funktionieren. Nutzung auf eigenes Risiko; erwäge eine Zweitnummer.'
printf '%s\n\n' 'Wenn du KI-Funktionen aktivierst, werden Nachrichteninhalte (auch Nachrichten deiner Kontakte, Sprachtranskripte und Bildbeschreibungen) an den von dir eingestellten KI-Anbieter gesendet, z.B. OpenAI. Dessen Bedingungen und Datenschutzerklärung gelten.'
printf 'Mehr dazu: %s\n\n' "$disclaimer_url"
if ((accept == 0)); then
  ask 'Hast du das gelesen und möchtest du fortfahren?' || { printf 'Abgebrochen. Es wurde nichts installiert.\n' >&2; exit 1; }
fi
privilege=()
if ((EUID != 0)); then privilege=(sudo); fi
if ! command -v docker >/dev/null; then
  . /etc/os-release
  if [[ $ID != debian && $ID != ubuntu ]]; then
    printf 'Bitte Docker Engine und das Compose-Plugin installieren: https://docs.docker.com/engine/install/\n' >&2
    exit 1
  fi
  if [[ $ID == debian && $VERSION_ID != 12 && $VERSION_ID != 13 ]] || [[ $ID == ubuntu && ! $VERSION_ID =~ ^(22\.04|24\.04|26\.04|26\.10)$ ]]; then
    printf 'Diese Linux-Version wird nicht automatisch eingerichtet. Bitte Docker nach der offiziellen Anleitung installieren.\n' >&2
    exit 1
  fi
  printf 'Docker fehlt. Die Installation richtet das offizielle Docker-Paketarchiv ein und benötigt Administratorrechte.\n'
  ask 'Docker jetzt installieren?' || exit 1
  "${privilege[@]}" apt-get update
  "${privilege[@]}" apt-get install -y ca-certificates curl
  "${privilege[@]}" install -m 0755 -d /etc/apt/keyrings
  "${privilege[@]}" curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  "${privilege[@]}" chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$(dpkg --print-architecture)" "$ID" "${UBUNTU_CODENAME:-$VERSION_CODENAME}" | "${privilege[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null
  "${privilege[@]}" apt-get update
  "${privilege[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
engine=(docker)
if ! docker info >/dev/null 2>&1; then
  if ((EUID == 0)); then printf 'Docker läuft nicht. Bitte den Docker-Dienst starten.\n' >&2; exit 1; fi
  ask 'Docker-Zugriff erfordert Administratorrechte. Für diese Installation sudo verwenden?' || exit 1
  engine=(sudo docker)
  "${engine[@]}" info >/dev/null || { printf 'Docker ist nicht erreichbar. Bitte den Dienst prüfen.\n' >&2; exit 1; }
fi
"${engine[@]}" compose version >/dev/null || { printf 'Bitte das Docker Compose-Plugin installieren: https://docs.docker.com/compose/install/linux/\n' >&2; exit 1; }

if [[ -e $install_dir/docker-compose.yml && -f $install_dir/.jarvis-install-version ]]; then
  printf 'Bestehende Jarvis-Installation wird fortgesetzt: %s\n' "$install_dir"
  # Respect an existing port saved by Compose/the wizard; never evaluate .env as shell code.
  saved_port=$(sed -n 's/^APP_WEB_PORT=\([0-9]*\)$/\1/p' "$install_dir/.env" 2>/dev/null || true)
  if [[ -n $saved_port ]]; then port=$saved_port; fi
else
  if [[ -e $install_dir && -n $(ls -A "$install_dir") ]]; then
    printf 'Der Zielordner ist nicht leer: %s. Bitte --dir mit einem neuen Ordner verwenden.\n' "$install_dir" >&2
    exit 1
  fi
  mkdir -p "$install_dir"
  free_kb=$(df -Pk "$install_dir" | awk 'NR==2 {print $4}')
  ((free_kb >= 2 * 1024 * 1024)) || { printf 'Bitte mindestens 2 GB freien Speicher für Installation und Builds bereitstellen.\n' >&2; exit 1; }
  if command -v ss >/dev/null && [[ -n $(ss -H -ltn "sport = :$port") ]]; then
    printf 'Port %s ist belegt. Wähle einen anderen mit --port.\n' "$port" >&2; exit 1
  fi
  metadata=$(curl --fail --silent --show-error --location "https://api.github.com/repos/joel-wlf/jarvis/commits/$ref")
  commit=$(printf '%s\n' "$metadata" | sed -n 's/^  "sha": "\([a-f0-9]\{40\}\)",$/\1/p')
  [[ $commit =~ ^[a-f0-9]{40}$ ]] || { printf 'GitHub-Version konnte nicht aufgelöst werden. --version mit einem Tag oder Commit verwenden.\n' >&2; exit 1; }
  archive=$(mktemp)
  trap 'rm -f "$archive"' EXIT
  printf 'Lade Jarvis-Version %s …\n' "$commit"
  curl --fail --silent --show-error --location "https://github.com/joel-wlf/jarvis/archive/$commit.tar.gz" -o "$archive"
  tar -xzf "$archive" --strip-components=1 -C "$install_dir"
  # umask 077 above would make db/init unreadable for the postgres container user; the sources are public anyway.
  chmod -R u+rwX,go+rX "$install_dir"
  printf '%s\n' "$commit" > "$install_dir/.jarvis-install-version"
  # Only infrastructure settings are written here. The wizard generates secrets later.
  printf 'APP_WEB_PORT=%s\n' "$port" > "$install_dir/.env"
  detected_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [[ $detected_ip =~ ^[0-9.]+$ ]]; then printf 'APP_HOME_URL=http://%s:%s\n' "$detected_ip" "$port" >> "$install_dir/.env"; fi
fi
cd "$install_dir"
export APP_WEB_PORT="$port"
"${engine[@]}" compose config -q
"${engine[@]}" compose pull admin app-web || printf 'Vorgebaute Images nicht erreichbar, baue lokal (das dauert länger).\n'
"${engine[@]}" compose up -d admin app-web
"${engine[@]}" compose logs --no-color admin
host_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
printf '\nEinrichtung: http://%s:%s\n' "${host_ip:-localhost}" "$port"
printf 'Öffne die angezeigte Adresse und lege dein Besitzer-Passwort fest. Alle weiteren Schritte erfolgen im Browser.\n'
if [[ -z ${SSH_CONNECTION:-} && -n ${DISPLAY:-${WAYLAND_DISPLAY:-}} ]] && command -v xdg-open >/dev/null; then
  xdg-open "http://localhost:$port" >/dev/null 2>&1 || true
fi
