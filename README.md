# Broadway Tracker

A personal theatre journal and shared archive, for the Broadway, touring,
regional, and local shows you have seen — and the nights you shared with the
people you saw them with.

Live at [broadway.rboskind.com](https://broadway.rboskind.com).

## What it does

- **A show, a production, a night.** The work, a particular staging of it, and
  each individual time you were in the room. Dates can be exact, a month, a
  year, or "some time around then", because a memory from 1998 is still worth
  keeping.
- **Shared nights.** An outing has attendees. A friend can say *I was there too*
  and join the same evening rather than making a second record of it.
- **Cast.** Who was in a production, and who you actually saw — including the
  night an understudy went on, which you can correct.
- **Local and school theatre.** A community company's own revue or a school's
  staging is recorded without going through catalog review, and two families
  from the same town converge on one record.
- **Writing.** Reviews, and pieces longer than a review, attached to the show or
  theatre they concern.
- **A map** of everywhere you have been, and where friends have been.
- **Photographs**, contributed per show, private unless offered publicly.

## Sharing

One setting on your profile governs your shows, nights, lists, and reviews, and
changing it brings existing content with it. Anything you set on its own item
stays where you put it.

Public pages are **anonymous**: no name, no handle, and an opaque id in the URL.
The exception is a published piece, which carries whatever byline its author
chose and does not link back to their profile.

## Running it

```sh
cp .env.example .env
pnpm install
pnpm db:up        # development Postgres, bound to 127.0.0.1 only
pnpm db:migrate
pnpm dev
```

`pnpm dev:lan` binds to the LAN for testing on a phone. Do not expose the Vite
dev server to the internet; for remote work, tunnel instead:

```sh
ssh -L 3000:127.0.0.1:3000 you@your-dev-server
```

### Checks

```sh
pnpm test        # vitest, against an isolated broadway_tracker_test database
pnpm lint        # biome
pnpm typecheck   # tsc --noEmit
```

## Deployment

Coolify with Nixpacks. `pnpm start` applies pending migrations and then boots,
so a failed migration stops the app rather than serving it against a schema it
does not match. Health check is `GET /api/health`, which verifies the database.

Required environment: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`ADMIN_EMAILS`, the `SMTP_*` set, the `S3_*` set, and `DIGEST_SECRET`. See
`.env.example`; everything there is read by the code.

**Scheduled letters.** `POST /api/digest` with
`authorization: Bearer $DIGEST_SECRET` sends what is due — nothing at all is on
a timer inside the app. A daily cron is right; each member's own window decides
whether they are due. Add `?dryRun=1` to assemble without sending.

## Images

Object storage is RustFS over the S3 API, and the bucket has **no public
access**. Uploads and reads both proxy through the backend: the browser never
talks to the bucket, and there are no presigned URLs. Keys are generated
server-side and uploads are checked by magic bytes rather than trusting the
declared type.

## Backups

Postgres is dumped on a schedule by Coolify and copied off-host, and the RustFS
bucket is backed up separately. Restore both from around the same moment: the
database holds only object keys, so a mismatched pair leaves keys with nothing
behind them.

`scripts/verify-restore.mjs` checks that a restored copy is complete, current,
and actually holds data — a structurally perfect restore of an empty database
is the failure that looks most like success. See
[`docs/backups.md`](docs/backups.md).

## Documentation

| | |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Conventions and traps. Read before changing code. |
| [`docs/architecture.md`](docs/architecture.md) | The model and where authorization lives |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | The running record of what was built and why |
| [`docs/catalog-import.md`](docs/catalog-import.md) | The bulk import format, written to hand to a language model |
| [`docs/backups.md`](docs/backups.md) | What is protected, what is not, and how to prove a restore |
| [`docs/writing-and-the-front-page.md`](docs/writing-and-the-front-page.md) | Why the home page is composed rather than a feed |
| [`docs/an-llm-layer.md`](docs/an-llm-layer.md) | Ideas for asking the app in words, and what must not leave the house |
