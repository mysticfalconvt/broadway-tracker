# Broadway Tracker architecture

## Product boundaries

Broadway Tracker is a personal theatre record, not a ticketing service or an uncontrolled social network. It supports musicals and plays across Broadway, off-Broadway, touring, regional, and local productions.

## Model choices

- **Show** is the enduring work, for example *Hadestown*.
- **Production** is a particular staging/run of a show, such as a Broadway production or national tour.
- **Library entry** is a user’s single record for a show. It owns the user’s current status, rating, review, and visibility.
- **Performance** logs each individual time a user sees the show, optionally linked to a production.
- **Friendship** uses one canonical row for a pair of users. The service layer must sort user IDs consistently before writing it.

## Privacy enforcement

Visibility is an authorization decision on the server, never merely a client-side display option:

- `private`: only the owner.
- `friends`: owner plus an accepted friendship.
- `public`: reserved for future public-facing profiles; do not expose by default.

All newly created user content defaults to `private`.

## Catalog moderation

Anyone signed in may submit a missing show. New submissions begin as `pending` and are not included in normal catalog search results until an administrator changes them to `published`. The admin workflow needs duplicate detection and an audit trail before the catalog grows beyond a small group.

## Authentication

Better Auth will own `user`, `session`, `account`, and `verification` tables. The application must:

- Require verification for password-created accounts.
- Send verification and password-reset messages through configured SMTP.
- Support Google OAuth using production callback URLs.
- Require an explicit, verified identity before linking an existing password account to a Google account.

## Object storage

RustFS is the object store. The app will issue short-lived presigned upload and read URLs rather than proxying image bytes through the Node process. Buckets remain private by default. Public show-art images can be introduced later only if that is an intentional policy.

## Deployment

One Node SSR application and one Postgres resource run in Coolify. The application runs idempotent Drizzle migrations on boot. `GET /api/health` checks only Postgres availability. Back up Postgres and RustFS off-host; an application volume is not the image-storage strategy.
