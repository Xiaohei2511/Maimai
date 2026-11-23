# Ubuntu API deployment

The server package is self contained in `server/`. It needs Node.js 22.13+ and a persistent directory at `/opt/maimai-api/data` for SQLite and uploaded media.

After SSH access is available:

```sh
sudo mkdir -p /opt/maimai-api/data
sudo chown -R ubuntu:ubuntu /opt/maimai-api
# Copy server/index.js, server/package.json and server/package-lock.json to /opt/maimai-api.
cd /opt/maimai-api
npm ci --omit=dev
sudo cp /path/to/maimai-api.service /etc/systemd/system/maimai-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now maimai-api
curl http://127.0.0.1:3001/health
```

Keep the API bound to `127.0.0.1`. Put a TLS reverse proxy in front of it on port 443, then set `/etc/maimai-api.env` to `PUBLIC_BASE_URL=https://your-api-domain`. A sample Caddy configuration is in `deploy/Caddyfile.example`. Restart the service after changing the environment file.

For a WeChat mini program, the API requires an owned HTTPS domain configured as both a request and upload domain in the WeChat console. An IP address alone is insufficient for release. Back up `/opt/maimai-api/data` regularly.
