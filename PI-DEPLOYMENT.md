# AimReboot on the Pi

Copy this project to a directory on your Pi and connect using your own SSH
username, hostname, and key. Keep your configured `.env` in that directory.

The bot starts its HTTP API automatically. The Pi uses `PORT=3003` in
`.env`; Docker forwards this to port 3000 inside the bot container.

From the deployment directory on the Pi:

```sh
docker compose -p aimreboot -f docker-compose.yml -f docker-compose.pi.yml up -d --build
docker compose -p aimreboot -f docker-compose.yml -f docker-compose.pi.yml ps
docker compose -p aimreboot -f docker-compose.yml -f docker-compose.pi.yml logs --tail=100 bot
```

Always include both Compose files: the Pi override gives the containers
unique names so they can coexist with the existing EditIL deployment.
The database uses the separate `aimreboot_postgres_data` volume.
Both services use `restart: unless-stopped`.

Check the API at `http://<pi-host>:3003/health` and Discord/database
readiness at `http://<pi-host>:3003/ready`.

The deployment was copied from this workspace, not cloned on the Pi.
To update it, transfer the changed source files and rebuild with the command
above. Keep `.env` private and transfer it only when intentionally updating
credentials. Do not use `down -v` unless you intend to delete the database.
