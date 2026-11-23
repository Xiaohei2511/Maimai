# Ubuntu API deployment

The server package is self contained in `server/`. It uses Node.js 24 and stores SQLite data and uploaded media in `/opt/maimai-api/data`.

## Deploy from GitHub Actions

1. In the repository, open **Settings → Secrets and variables → Actions → New repository secret**. Name it `DEPLOY_SSH_PASSWORD` and enter the Ubuntu SSH password. Never commit the password to a file.
2. Open **Actions → Deploy Maimai API → Run workflow**. The workflow transfers the server files to `123.206.111.20`, verifies an official Node.js download, installs production dependencies, registers a systemd service, and checks `http://127.0.0.1:3001/health` on the server.
3. The API remains bound to localhost. To expose it to clients, set up a TLS reverse proxy with an owned domain, then set `/etc/maimai-api.env` to `PUBLIC_BASE_URL=https://your-api-domain` and restart `maimai-api`. A sample Caddy configuration is in `Caddyfile.example`.

For a WeChat mini program, add the HTTPS domain to both request and upload domains in the WeChat console. An IP address alone is insufficient for release. Back up `/opt/maimai-api/data` regularly.

## Manual installation

Upload `server/index.js`, `server/package.json`, `server/package-lock.json`, `deploy/maimai-api.service`, and `deploy/install-ubuntu.sh` to `/home/ubuntu/maimai-upload/`, then run `bash /home/ubuntu/maimai-upload/install-ubuntu.sh` as the `ubuntu` user. Passwordless sudo is required for the unattended installer.
