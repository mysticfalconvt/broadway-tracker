# Broadway Tracker

A private-by-default personal theatre library for keeping track of the Broadway, touring, regional, and local shows you love.

## Current foundation

- TanStack Start / React / TypeScript server-rendered application
- Postgres + Drizzle schema and migrations
- Better Auth dependency reserved for email/password, email verification, password reset, and Google OAuth
- Core data model for shows, productions, personal library entries, performance logs, lists, and approved friendships
- Coolify/Nixpacks deployment configuration with migrations on app startup
- `GET /api/health` verifies the database connection for Coolify health checks

## Planned implementation order

1. Configure Better Auth and SMTP email verification/password reset.
2. Add Google OAuth once the production hostname is known.
3. Build private library, show search, and quick show entry.
4. Build admin review for catalog submissions.
5. Build approved friend requests and friends-only sharing.
6. Add direct-to-RustFS image upload when user-generated images are introduced.

## Local development

```sh
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

`pnpm db:up` starts the development-only Postgres container from `compose.dev.yml`. The default `DATABASE_URL` in `.env.example` matches it. The container only listens on `127.0.0.1`, so it is not exposed to the LAN.

`DATABASE_URL` is required to run the health endpoint or any database-backed route. The initial landing page itself can render without it.

### Developing from another device

**Recommended: SSH tunnel.** Keep Vite and Postgres private on the development server, then run this on the device where you use the browser:

```sh
ssh -L 3000:127.0.0.1:3000 rboskind@YOUR_DEVELOPMENT_SERVER
```

Start `pnpm dev` on the development server and visit [http://localhost:3000](http://localhost:3000) on the other device. Zed can edit the remote project over SSH; the tunnel is only for browser access.

For trusted-LAN testing only, run `pnpm dev:lan` and browse to `http://SERVER_LAN_IP:3000`. Do not expose Vite’s development server to the public internet.

## Deployment in Coolify

1. Create a Git repository named `broadway-tracker` and add it as a Coolify application.
2. Create or attach a Coolify Postgres resource and set `DATABASE_URL`.
3. Add the required production secrets from `.env.example`.
4. Set the public app URL as `BETTER_AUTH_URL`.
5. Configure Coolify’s health check as `GET /api/health`.

Nixpacks uses `nixpacks.toml` to pin a compatible Node/pnpm runtime. The startup command applies pending migrations before launching the server.

## Object storage

Use RustFS through its S3-compatible API rather than an application volume. Store object keys in Postgres and upload from the browser with short-lived presigned URLs. This keeps the deployed application stateless and makes image backup and future scaling safer.

## Privacy rules

- Profiles, ratings, reviews, lists, and library entries default to `private`.
- `friends` visibility is only available to approved, bidirectional friendships.
- A submitted catalog show is `pending` until an administrator publishes it.
