#!/usr/bin/env bash
# Writes the Raspberry Pi Imager list (os_list) for one built image, so Imager can show Jarvis in its menu and offer
# its settings (Wi-Fi, host name) for it.  Usage: imager-json.sh <image.img.xz> <download-url> <version>
set -euo pipefail
image=$1 url=$2 version=$3
download_size=$(stat -c %s "$image")
download_sha=$(sha256sum "$image" | cut -d' ' -f1)
extract_size=$(xz -dc "$image" | wc -c)
extract_sha=$(xz -dc "$image" | sha256sum | cut -d' ' -f1)
jq -n \
  --arg name "Jarvis $version" \
  --arg url "$url" \
  --arg date "$(date -u +%F)" \
  --arg dsha "$download_sha" --arg esha "$extract_sha" \
  --argjson dsize "$download_size" --argjson esize "$extract_size" \
  '{
    os_list: [{
      name: $name,
      description: "Your private context manager for WhatsApp. Opens at http://jarvis.local after the first start.",
      url: $url,
      icon: "https://raw.githubusercontent.com/joel-wlf/jarvis/main/app/assets/icon.png",
      website: "https://joel-wlf.github.io/jarvis/",
      release_date: $date,
      extract_size: $esize,
      extract_sha256: $esha,
      image_download_size: $dsize,
      image_download_sha256: $dsha,
      devices: ["pi5-64bit", "pi4-64bit"],
      init_format: "cloudinit-rpi"
    }]
  }'
