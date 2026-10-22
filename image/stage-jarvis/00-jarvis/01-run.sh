#!/bin/bash -e
# Copies Jarvis (the repository at the built commit, placed in files/jarvis by the workflow) to /opt/jarvis and
# installs the boot services. Runs on the build host.

install -d -m 755 "${ROOTFS_DIR}/opt/jarvis"
cp -a files/jarvis/. "${ROOTFS_DIR}/opt/jarvis/"
chmod -R u+rwX,go+rX "${ROOTFS_DIR}/opt/jarvis"
# Port 80, so the address is just http://jarvis.local. The setup in the browser writes everything else.
install -m 600 /dev/null "${ROOTFS_DIR}/opt/jarvis/.env"
printf 'APP_WEB_PORT=80\nAUTO_UPDATE=true\n' > "${ROOTFS_DIR}/opt/jarvis/.env"

install -m 755 files/jarvis-boot files/jarvis-mdns "${ROOTFS_DIR}/usr/local/sbin/"
install -m 644 files/jarvis-boot.service files/jarvis-mdns.service "${ROOTFS_DIR}/etc/systemd/system/"
install -d -m 755 "${ROOTFS_DIR}/usr/local/share/jarvis-wait"
install -m 644 files/wait/index.html "${ROOTFS_DIR}/usr/local/share/jarvis-wait/"
install -m 644 files/jarvis/app/assets/jarvis/idle_a.png "${ROOTFS_DIR}/usr/local/share/jarvis-wait/jarvis.png"
