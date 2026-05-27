# RacingGame

3D racing sandbox with online realtime lap leaderboards.

## Local Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Other devices on the same network can open the LAN URL printed by the server.

## Online Leaderboard

The server stores records in Postgres when `DATABASE_URL` is set. Without it,
records fall back to `data/leaderboard.json` for local play.

Deploy the Node app to a web host such as Render, Railway, Fly.io, or any VPS.
For Render, connect this GitHub repo and set `DATABASE_URL` to a Postgres
connection string.
