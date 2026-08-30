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
- `public`: readable by anybody, including signed-out visitors.

**Public is more open than friends, not a different axis.** A query matching `friends` exactly hides
public content from the very people it was shared with. Use `inArray(column, ['friends', 'public'])`.

New content follows the author's profile setting rather than a fixed constant, and changing that
setting moves everything still following it. Anything set explicitly on its own item stays put.

Public surfaces are anonymous: no name, no handle, and an opaque account id in URLs. A published
piece is the deliberate exception — it carries the byline its author chose for it, and never links
back to the profile.

## Catalog moderation

Anyone signed in may submit a missing show. New submissions begin as `pending` and are not included in normal catalog search results until an administrator changes them to `published`. The admin workflow needs duplicate detection and an audit trail before the catalog grows beyond a small group.

## Authentication

Better Auth owns `user`, `session`, `account`, and `verification`. Verification is required for
password accounts, mail goes through SMTP, and Google OAuth is live.

`src/server/session.ts` is the only place that asks Better Auth who the caller is. Read-only
impersonation for administrators is enforced there, so any code resolving a session another way
opts out of it silently.

Better Auth applies its own `additionalFields.defaultValue` and it wins over the column default, so
the schema, the auth config, and the synthetic-user hook must agree. `tests/auth-config.test.ts`
fails when they drift.

## Object storage

RustFS is the object store, and the bucket has **no public access at all**. Both directions proxy
through the application: the browser never talks to the bucket and no presigned URLs are issued.
Object keys are generated server-side, and an upload's type is decided by its magic bytes rather
than by what the client claimed.

## Deployment

One Node SSR application and one Postgres resource run in Coolify. The application runs idempotent Drizzle migrations on boot. `GET /api/health` checks only Postgres availability. Back up Postgres and RustFS off-host; an application volume is not the image-storage strategy.
