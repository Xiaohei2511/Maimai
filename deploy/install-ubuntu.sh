#!/usr/bin/env bash
set -euo pipefail

# Run as the ubuntu user after uploading server files and the systemd unit to ~/maimai-upload.
if ! sudo -n true; then
  echo 'The ubuntu user needs passwordless sudo for unattended installation.' >&2
  exit 1
fi

node_version='v24.22.3'
case "$(uname -m)" in
  x86_64) node_arch='x64' ;;
  aarch64) node_arch='arm64' ;;
  *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
esac
node_archive="node-${node_version}-linux-${node_arch}.tar.gz"
node_root="/opt/maimai-node/${node_version}"
if [ ! -x "${node_root}/bin/node" ]; then
  download_dir="$(mktemp -d)"
  trap 'rm -rf "$download_dir"' EXIT
  cd "$download_dir"
  curl -fsSLO "https://nodejs.org/dist/${node_version}/${node_archive}"
  curl -fsSLO "https://nodejs.org/dist/${node_version}/SHASUMS256.txt"
  grep " ${node_archive}$" SHASUMS256.txt | sha256sum -c -
  sudo install -d "$node_root"
  sudo tar -xzf "$node_archive" -C "$node_root" --strip-components=1
fi

sudo install -d -o ubuntu -g ubuntu /opt/maimai-api /opt/maimai-api/data
install -m 0644 /home/ubuntu/maimai-upload/index.js /opt/maimai-api/index.js
install -m 0644 /home/ubuntu/maimai-upload/package.json /opt/maimai-api/package.json
install -m 0644 /home/ubuntu/maimai-upload/package-lock.json /opt/maimai-api/package-lock.json
cd /opt/maimai-api
"${node_root}/bin/node" "${node_root}/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --no-audit --no-fund
sudo install -m 0644 /home/ubuntu/maimai-upload/maimai-api.service /etc/systemd/system/maimai-api.service
sudo systemctl daemon-reload
sudo systemctl enable maimai-api
sudo systemctl restart maimai-api
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3001/health; then
    echo
    echo 'Maimai API is running on 127.0.0.1:3001.'
    exit 0
  fi
  sleep 2
done
sudo systemctl --no-pager status maimai-api || true
exit 1
