#!/bin/sh
# Jarvis installer: installs Docker if needed, downloads the compose bundle, pulls the prebuilt images and starts the
# admin interface. Safe to run again: it updates to the chosen version and never overwrites your .env.
#
#   curl -fsSL https://raw.githubusercontent.com/joel-wlf/jarvis/main/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --yes --dir /srv/jarvis --version 1.2.0
#
# Options: --dir DIR  --version X.Y.Z|latest  --yes  --uninstall [--purge]  --help
set -eu

# The one place that names the repository (owner/name). Images live at ghcr.io/<repo>-<service>.
REPO="${JARVIS_REPO:-joel-wlf/jarvis}"

DIR="${HOME:-.}/jarvis"
VERSION=""
YES=0
UNINSTALL=0
PURGE=0
SUDO=0 # 1 = run docker through sudo

case "${LANG:-}" in de*) L=de ;; *) L=en ;; esac

# ---- messages (English default, German when LANG starts with de) ------------------------------------------------------
t() {
  if [ "$L" = de ]; then
    case "$1" in
      usage) echo "Verwendung: install.sh [--dir ORDNER] [--version X.Y.Z|latest] [--yes] [--uninstall [--purge]]" ;;
      badarg) echo "Unbekannte Option: %s" ;;
      needval) echo "Die Option %s braucht einen Wert." ;;
      os) echo "System: %s (%s)" ;;
      badarch) echo "Nicht unterstützte Architektur: %s. Unterstützt: arm64 und amd64." ;;
      bados) echo "Nicht unterstützt: %s. Unterstützt: Raspberry Pi OS, Debian, Ubuntu und macOS mit Docker Desktop." ;;
      oddlinux) echo "Hinweis: %s ist nicht Debian/Ubuntu/Raspberry Pi OS. Ich versuche es trotzdem, wenn Docker schon da ist." ;;
      mac_nodocker) echo "Docker fehlt. Installiere Docker Desktop von https://www.docker.com/products/docker-desktop/ , starte es einmal und führe dieses Skript dann erneut aus." ;;
      mac_notrunning) echo "Docker Desktop läuft nicht. Bitte starten und das Skript erneut ausführen." ;;
      nodocker) echo "Docker ist nicht installiert." ;;
      askdocker) echo "Docker Engine mit dem Compose-Plugin über das offizielle Skript von get.docker.com installieren? (benötigt Root/sudo)" ;;
      declined) echo "Abgebrochen. Ohne Docker kann Jarvis nicht laufen." ;;
      installing) echo "Installiere Docker …" ;;
      nosudo) echo "Dafür werden Root-Rechte gebraucht, und sudo ist nicht vorhanden. Als root erneut ausführen." ;;
      nocompose) echo "Docker ist da, aber das Compose-Plugin fehlt (docker compose). Bitte das Paket docker-compose-plugin installieren." ;;
      nodaemon) echo "Der Docker-Dienst antwortet nicht. Unter Linux: sudo systemctl start docker" ;;
      needtty) echo "Keine Rückfrage möglich (kein Terminal). Mit --yes erneut ausführen, um alle Fragen mit Ja zu beantworten." ;;
      noget) echo "curl oder wget wird gebraucht." ;;
      version) echo "Version: %s (Images: %s)" ;;
      nolatest) echo "Noch kein Release gefunden, verwende den Stand von main mit den Images :latest." ;;
      dir) echo "Installationsordner: %s" ;;
      download) echo "Lade docker-compose.yml, .env.example und db/init …" ;;
      dlfail) echo "Download fehlgeschlagen: %s" ;;
      envkept) echo "Vorhandene .env bleibt erhalten (nur JARVIS_VERSION wird gesetzt)." ;;
      pull) echo "Lade die Images (einige hundert MB, je nach Verbindung ein paar Minuten) …" ;;
      pullfail) echo "Die Images konnten nicht geladen werden. Internetverbindung prüfen oder die Version mit --version ändern." ;;
      start) echo "Starte die Oberfläche …" ;;
      startall) echo "Jarvis ist schon eingerichtet: starte alle Dienste mit der neuen Version …" ;;
      wait) echo "Warte, bis die Oberfläche bereit ist …" ;;
      waitfail) echo "Die Oberfläche wurde nicht rechtzeitig bereit. Log ansehen: cd %s && docker compose logs admin" ;;
      done) echo "Fertig." ;;
      seturl) echo "Einrichtung im Browser öffnen: %s" ;;
      setcode) echo "Einrichtungscode: %s" ;;
      nocode) echo "Die Oberfläche ist bereits eingerichtet; melde dich mit deinem Passwort an." ;;
      codelost) echo "Den Einrichtungscode zeigt: cd %s && docker compose logs admin" ;;
      update) echo "Aktualisieren später: dieses Skript erneut ausführen (oder in der Oberfläche unter Wartung)." ;;
      un_stop) echo "Stoppe und entferne die Container …" ;;
      un_none) echo "Kein Jarvis in %s gefunden." ;;
      un_ask) echo "Auch die Daten löschen (Datenbank mit allen Nachrichten, WhatsApp-Sitzung)? Das lässt sich nicht rückgängig machen." ;;
      un_kept) echo "Daten bleiben erhalten. Ordner %s (mit .env) wurde nicht gelöscht." ;;
      un_purged) echo "Container und Datenvolumes sind gelöscht. Ordner %s (mit .env) wurde nicht gelöscht." ;;
      yes_hint) echo "[j/N]" ;;
    esac
  else
    case "$1" in
      usage) echo "Usage: install.sh [--dir DIR] [--version X.Y.Z|latest] [--yes] [--uninstall [--purge]]" ;;
      badarg) echo "Unknown option: %s" ;;
      needval) echo "Option %s needs a value." ;;
      os) echo "System: %s (%s)" ;;
      badarch) echo "Unsupported architecture: %s. Supported: arm64 and amd64." ;;
      bados) echo "Unsupported: %s. Supported: Raspberry Pi OS, Debian, Ubuntu, and macOS with Docker Desktop." ;;
      oddlinux) echo "Note: %s is not Debian/Ubuntu/Raspberry Pi OS. Trying anyway if Docker is already there." ;;
      mac_nodocker) echo "Docker is missing. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ , start it once, then run this script again." ;;
      mac_notrunning) echo "Docker Desktop is not running. Start it and run this script again." ;;
      nodocker) echo "Docker is not installed." ;;
      askdocker) echo "Install Docker Engine with the Compose plugin using the official script from get.docker.com? (needs root/sudo)" ;;
      declined) echo "Aborted. Jarvis cannot run without Docker." ;;
      installing) echo "Installing Docker …" ;;
      nosudo) echo "This needs root rights and sudo is not available. Run again as root." ;;
      nocompose) echo "Docker is installed but the Compose plugin is missing (docker compose). Please install the docker-compose-plugin package." ;;
      nodaemon) echo "The Docker service does not respond. On Linux: sudo systemctl start docker" ;;
      needtty) echo "Cannot ask questions (no terminal). Run again with --yes to answer all questions with yes." ;;
      noget) echo "curl or wget is required." ;;
      version) echo "Version: %s (images: %s)" ;;
      nolatest) echo "No release found yet, using main with the :latest images." ;;
      dir) echo "Install directory: %s" ;;
      download) echo "Downloading docker-compose.yml, .env.example and db/init …" ;;
      dlfail) echo "Download failed: %s" ;;
      envkept) echo "Existing .env is kept (only JARVIS_VERSION is set)." ;;
      pull) echo "Pulling images (a few hundred MB, a few minutes depending on your connection) …" ;;
      pullfail) echo "Could not pull the images. Check your internet connection or choose another version with --version." ;;
      start) echo "Starting the web interface …" ;;
      startall) echo "Jarvis is already set up: starting all services on the new version …" ;;
      wait) echo "Waiting for the web interface …" ;;
      waitfail) echo "The web interface did not become ready in time. See the log: cd %s && docker compose logs admin" ;;
      done) echo "Done." ;;
      seturl) echo "Open the setup in your browser: %s" ;;
      setcode) echo "Setup code: %s" ;;
      nocode) echo "The interface is already set up; sign in with your password." ;;
      codelost) echo "Show the setup code with: cd %s && docker compose logs admin" ;;
      update) echo "To update later: run this script again (or use Maintenance in the web interface)." ;;
      un_stop) echo "Stopping and removing the containers …" ;;
      un_none) echo "No Jarvis found in %s." ;;
      un_ask) echo "Also delete the data (database with all messages, WhatsApp session)? This cannot be undone." ;;
      un_kept) echo "Your data is kept. The folder %s (with .env) was not deleted." ;;
      un_purged) echo "Containers and data volumes are deleted. The folder %s (with .env) was not deleted." ;;
      yes_hint) echo "[y/N]" ;;
    esac
  fi
}

# say KEY [ARG...]: print a message; the format comes from t() and is a trusted constant.
say() {
  key="$1"
  shift
  # shellcheck disable=SC2059
  printf "$(t "$key")\n" "$@"
}

die() {
  key="$1"
  shift
  # shellcheck disable=SC2059
  printf 'error: %s\n' "$(printf "$(t "$key")" "$@")" >&2
  exit 1
}

# ask KEY [ARG...]: yes/no question, default no. --yes answers yes. Reads from the terminal because stdin is the script
# when piped from curl.
ask() {
  [ "$YES" = 1 ] && return 0
  if ! [ -r /dev/tty ]; then die needtty; fi
  key="$1"
  shift
  # shellcheck disable=SC2059
  printf '%s %s ' "$(printf "$(t "$key")" "$@")" "$(t yes_hint)" >&2
  read -r answer </dev/tty || answer=""
  case "$answer" in y | Y | yes | YES | j | J | ja | Ja | JA) return 0 ;; *) return 1 ;; esac
}

# ---- helpers ----------------------------------------------------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch URL DEST
  if have curl; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif have wget; then
    wget -q -O "$2" "$1"
  else
    die noget
  fi
}

fetch_stdout() {
  if have curl; then
    curl -fsSL --retry 3 "$1"
  elif have wget; then
    wget -q -O - "$1"
  else
    die noget
  fi
}

# Docker may need sudo right after a fresh install (the user is not in the docker group yet).
dk() { if [ "$SUDO" = 1 ]; then sudo docker "$@"; else docker "$@"; fi; }
dc() { dk compose "$@"; }

env_value() { # env_value KEY: last value in .env, without quotes
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed "s/^[\"']//; s/[\"']\$//"
}

# ---- steps ------------------------------------------------------------------------------------------------------------
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes | -y) YES=1 ;;
      --uninstall) UNINSTALL=1 ;;
      --purge) PURGE=1 ;;
      --dir | --version)
        [ $# -ge 2 ] || die needval "$1"
        if [ "$1" = --dir ]; then DIR="$2"; else VERSION="$2"; fi
        shift
        ;;
      --dir=*) DIR="${1#--dir=}" ;;
      --version=*) VERSION="${1#--version=}" ;;
      --help | -h)
        t usage
        exit 0
        ;;
      *)
        t usage >&2
        die badarg "$1"
        ;;
    esac
    shift
  done
}

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  say os "$OS" "$ARCH"
  case "$ARCH" in
    aarch64 | arm64 | x86_64 | amd64) ;;
    *) die badarch "$ARCH" ;;
  esac
  case "$OS" in
    Darwin) ;;
    Linux)
      distro=""
      if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        distro="$(. /etc/os-release && echo "${ID:-} ${ID_LIKE:-}")"
      fi
      case " $distro " in
        *" debian "* | *" ubuntu "* | *" raspbian "*) ;;
        *) say oddlinux "${distro:-Linux}" ;;
      esac
      ;;
    *) die bados "$OS" ;;
  esac
}

install_docker_linux() {
  say nodocker
  ask askdocker || die declined
  if [ "$(id -u)" -ne 0 ]; then
    have sudo || die nosudo
    SUDO=1
  fi
  say installing
  tmp="$(mktemp)"
  fetch https://get.docker.com "$tmp"
  if [ "$SUDO" = 1 ]; then sudo sh "$tmp"; else sh "$tmp"; fi
  rm -f "$tmp"
  if have systemctl; then
    if [ "$SUDO" = 1 ]; then sudo systemctl enable --now docker >/dev/null 2>&1 || true; else systemctl enable --now docker >/dev/null 2>&1 || true; fi
  fi
}

ensure_docker() {
  if ! have docker; then
    if [ "$OS" = Darwin ]; then die mac_nodocker; fi
    install_docker_linux
  fi
  # Reachable without sudo? If not, try sudo (typical right after the first install).
  if [ "$SUDO" = 0 ] && ! docker info >/dev/null 2>&1; then
    if [ "$OS" = Linux ] && [ "$(id -u)" -ne 0 ] && have sudo && sudo docker info >/dev/null 2>&1; then
      SUDO=1
    elif [ "$OS" = Darwin ]; then
      die mac_notrunning
    else
      die nodaemon
    fi
  fi
  dc version >/dev/null 2>&1 || die nocompose
}

resolve_version() {
  case "$VERSION" in
    "" | latest)
      tag="$(fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1 || true)"
      if [ -n "$tag" ]; then
        REF="$tag"
        IMAGE_TAG="${tag#v}"
        PIN=1
      else
        say nolatest
        REF="main"
        IMAGE_TAG="latest"
        PIN=0
      fi
      ;;
    main)
      REF="main"
      IMAGE_TAG="latest"
      PIN=0
      ;;
    *)
      IMAGE_TAG="${VERSION#v}"
      REF="v$IMAGE_TAG"
      PIN=1
      ;;
  esac
  say version "$REF" "$IMAGE_TAG"
}

download_bundle() {
  base="https://raw.githubusercontent.com/$REPO/$REF"
  say download
  mkdir -p "$DIR/db/init" "$DIR/outgoing"
  tmpd="$(mktemp -d)"
  trap 'rm -rf "$tmpd"' EXIT
  for f in docker-compose.yml .env.example; do
    fetch "$base/$f" "$tmpd/$f" || die dlfail "$base/$f"
  done
  # The raw host cannot list a directory; the contents API can.
  list="$(fetch_stdout "https://api.github.com/repos/$REPO/contents/db/init?ref=$REF" | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p')" || die dlfail "db/init"
  [ -n "$list" ] || die dlfail "db/init"
  mkdir -p "$tmpd/db/init"
  for f in $list; do
    fetch "$base/db/init/$f" "$tmpd/db/init/$f" || die dlfail "$base/db/init/$f"
  done
  # Everything arrived: only now replace the files in place.
  cp "$tmpd/docker-compose.yml" "$DIR/docker-compose.yml"
  cp "$tmpd/.env.example" "$DIR/.env.example"
  cp "$tmpd/db/init/"* "$DIR/db/init/"
  chmod +x "$DIR"/db/init/*.sh 2>/dev/null || true
}

# Pin JARVIS_VERSION in .env without touching any other line; creates .env (only that line) if there is none.
pin_version() {
  [ "$PIN" = 1 ] || return 0
  if [ -f .env ]; then
    say envkept
    grep -v '^JARVIS_VERSION=' .env >.env.tmp || true
    printf 'JARVIS_VERSION=%s\n' "$IMAGE_TAG" >>.env.tmp
    # keep owner and mode of the existing file
    cat .env.tmp >.env
    rm -f .env.tmp
  else
    (umask 077 && printf 'JARVIS_VERSION=%s\n' "$IMAGE_TAG" >.env)
  fi
}

lan_ip() {
  ip=""
  if [ "$OS" = Darwin ]; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  elif have hostname; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "${ip:-localhost}"
}

wait_admin() {
  say wait
  n=0
  while [ "$n" -lt 90 ]; do
    cid="$(dc ps -q admin 2>/dev/null | head -n 1 || true)"
    if [ -n "$cid" ]; then
      status="$(dk inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      case "$status" in healthy | running) return 0 ;; esac
    fi
    n=$((n + 1))
    sleep 2
  done
  die waitfail "$DIR"
}

install() {
  detect_platform
  ensure_docker
  resolve_version
  say dir "$DIR"
  download_bundle
  cd "$DIR"
  pin_version

  say pull
  dc pull || die pullfail
  if [ -n "$(env_value POSTGRES_PASSWORD)" ]; then
    # Already set up: roll the whole stack onto the new version. Compose only recreates what changed.
    say startall
    dc up -d
  else
    # Postgres needs its password first; the setup wizard in the interface creates it and starts the rest.
    say start
    dc up -d admin
  fi
  wait_admin

  port="$(env_value ADMIN_PORT)"
  say done
  echo
  say seturl "http://$(lan_ip):${port:-8080}"
  code="$(dc logs admin 2>&1 | sed -n 's/.*Einrichtungscode: *//p; s/.*Setup code: *//p' | tail -n 1 | tr -d '\r' || true)"
  if [ -n "$code" ]; then
    say setcode "$code"
  elif [ -n "$(env_value POSTGRES_PASSWORD)" ]; then
    say nocode
  else
    say codelost "$DIR"
  fi
  echo
  say update
}

uninstall() {
  detect_platform
  [ -f "$DIR/docker-compose.yml" ] || die un_none "$DIR"
  ensure_docker
  cd "$DIR"
  say un_stop
  dc down --remove-orphans
  if [ "$PURGE" = 1 ] || { [ "$YES" = 0 ] && ask un_ask; }; then
    dc down --volumes --remove-orphans
    say un_purged "$DIR"
  else
    say un_kept "$DIR"
  fi
}

main() {
  parse_args "$@"
  # A relative --dir stays valid after cd.
  case "$DIR" in /*) ;; *) DIR="$(pwd)/$DIR" ;; esac
  if [ "$UNINSTALL" = 1 ]; then uninstall; else install; fi
}

main "$@"
