# Broadway Tracker — Implementation Plan

> **Purpose:** Living checklist for building Broadway Tracker. Check an item only after it is implemented and validated.
>
> **Product:** A private-by-default personal theatre library — Goodreads for Broadway, touring, regional, and local shows — for family and friends first.

## Guiding decisions

- **Audience:** Family and friends initially; designed to grow without becoming an engagement-driven social network.
- **Privacy:** Profiles and all user-created content default to **private**. Friends-only sharing requires an approved friendship.
- **Catalog:** Start with a manually curated catalog. Signed-in users can submit missing shows; an administrator approves, rejects, or merges submissions.
- **Data model:** A *show* is the work itself; a *production* is a particular Broadway, touring, regional, or local staging of that work.
- **Images:** Use RustFS through its S3-compatible API. Do not store image uploads on a Coolify application volume.
- **Infrastructure:** One TanStack Start Node app and one Postgres database deployed through Coolify. No Redis, queue, or separate API service for the MVP.

---

## 0. Project foundation

- [x] Create `broadway-tracker` directory and initialize a local Git repository on the `main` branch.
- [x] Add TanStack Start, TypeScript, Tailwind, Biome, Drizzle, and Better Auth project configuration.
- [x] Add Coolify/Nixpacks startup configuration.
- [x] Add `.env.example` with database, auth, SMTP, Google OAuth, and RustFS configuration placeholders.
- [x] Add a first landing page and shared application shell.
- [x] Add `GET /api/health` that verifies Postgres connectivity.
- [x] Define the initial Drizzle schema and first database migration.
- [x] Add a follow-up migration for shared outings, attendee-owned opinions, fuzzy dates, and independent favorites.
- [x] Document architecture, deployment, privacy, and storage decisions.
- [x] Install Node 22 and pnpm on the development server.
- [x] Run `pnpm install`; `pnpm-lock.yaml` is ready to commit.
- [x] Run `pnpm build` and `pnpm lint`; both pass.
- [ ] Create the remote Git repository and push the initial project.

## 1. Local and production infrastructure

- [x] Add a Docker Compose development Postgres definition and `pnpm db:up` / `pnpm db:down` scripts.
- [x] Configure development `DATABASE_URL` through the host-published Coolify Postgres port.
- [x] Apply the initial migration with `pnpm db:migrate`.
- [x] Confirm `GET /api/health` returns `200 {"status":"ok"}` against the development database.
- [ ] Create a Coolify application connected to the Git repository.
- [x] Create or attach a Coolify Postgres resource.
- [ ] Configure Coolify environment secrets, beginning with `DATABASE_URL` and `BETTER_AUTH_SECRET`.
- [ ] Configure the Coolify health check as `GET /api/health`.
- [ ] Deploy the empty foundation successfully to a non-production/test hostname.
- [ ] Enable scheduled Postgres backups and configure an off-host backup destination.

## 2. Authentication and accounts

**Goal:** A user can safely create, verify, access, recover, and manage an account.

- [ ] Configure Better Auth with the Drizzle/Postgres adapter.
- [ ] Add the Better Auth API route/handler.
- [ ] Create an SMTP mail transport from environment variables.
- [ ] Implement email/password sign-up.
- [ ] Require email verification before full account access.
- [ ] Implement verification-email sending and resend flow.
- [ ] Implement email/password sign-in and sign-out.
- [ ] Implement a password-reset request and password-reset flow.
- [ ] Add Google OAuth configuration behind `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- [ ] Create the Google Cloud OAuth client once the public hostname is known.
- [ ] Configure the exact Google authorized redirect URI for the deployed hostname.
- [ ] Define safe account-linking behavior for users who sign in with both password and Google.
- [ ] Add protected-route/session middleware and an authenticated application layout.
- [ ] Build settings for name, handle, profile image, and default profile visibility.
- [ ] Add auth-flow and authorization tests.

## 3. Catalog and moderation

**Goal:** Users can find reliable show records without depending on an external catalog provider.

- [ ] Build a public-to-signed-in catalog search interface for published shows.
- [ ] Add title, type (musical/play/other), synopsis, and optional image metadata to the show detail screen.
- [ ] Build the show-submission form for signed-in users.
- [ ] Generate URL-safe slugs and handle title collisions.
- [ ] Keep user-submitted shows in `pending` status by default.
- [ ] Build a minimal admin review queue for pending submissions.
- [ ] Let admins publish, reject, edit, and merge duplicate show records.
- [ ] Add a production editor for Broadway, Off-Broadway, touring, regional, local, and other productions.
- [ ] Seed a small initial catalog of popular shows after the admin workflow works.
- [ ] Add tests for catalog visibility, submission, and moderation permissions.

## 4. Shared outings and memory model

**Goal:** Model a theatre night’s shared facts without taking ownership of an attendee’s personal response.

- [x] Add `outings` for shared show/production, venue, city, fuzzy date, and shared context.
- [x] Add `outing_attendees` for invitation state and attendee-owned rating, favorite, review, privacy, and private notes.
- [x] Support exact, month, year, approximate, and unknown date precision at the data-model layer.
- [ ] Build server-side service functions that validate date precision and authorize attendee invitations.
- [ ] Build the quick-log flow and make the creator an accepted attendee automatically.
- [ ] Build the shared-memory detail page, separating shared facts from personal and private content.
- [ ] Migrate/drop the legacy one-person `performances` table after the new logging flow is live.

## 5. Personal theatre library — MVP core

**Goal:** The user can build a satisfying private record of their theatre life.

- [ ] Create a personal library page with Want to See, Seen, and Favorites views.
- [ ] Let users add a published show to their library.
- [ ] Let users update status: `want_to_see` or `seen`, with Favorite as an independent state.
- [ ] Let users give an optional 0.5–5 rating and write a personal review/note.
- [ ] Let users choose private or friends visibility per library entry.
- [ ] Add a quick “log a performance” flow: date, production, venue, city, and private notes.
- [ ] Support multiple performance logs for the same show.
- [ ] Build a user-facing show detail page with their own library data and performance history.
- [ ] Add filters, sort order, and empty states to the library.
- [ ] Add server-side authorization checks for every library read/write operation.
- [ ] Add tests for library status changes, privacy, ratings, and performance logging.

## 6. Lists and personal profile

**Goal:** Users can curate and revisit theatre memories beyond a single status list.

- [ ] Create custom lists with title, description, and privacy setting.
- [ ] Add/remove shows from lists and support ordering.
- [ ] Build a personal profile page with library highlights and favorite shows.
- [ ] Add useful, non-competitive personal stats (for example: shows seen by year or type).
- [ ] Ensure profile and list pages honor each owner’s privacy settings.
- [ ] Add tests for custom-list authorization and visibility.

## 7. Friends and friends-only sharing

**Goal:** Share thoughtfully with an approved inner circle, without public-social pressure.

- [ ] Build friend search by handle.
- [ ] Implement a send/cancel friend-request flow.
- [ ] Implement incoming-request approval, rejection, and removal flows.
- [ ] Enforce a single canonical friendship row per user pair.
- [ ] Build a simple Friends page: requests, approved friends, and removal controls.
- [ ] Allow friends to view only `friends`-visible profiles, entries, reviews, and lists.
- [ ] Build a quiet, chronological friends activity view (optional after core sharing works).
- [ ] Do not add follower counts, public leaderboards, or engagement-pressure mechanics.
- [ ] Add thorough privacy/authorization tests, including rejected and blocked relationships.

## 8. RustFS image storage

**Goal:** Add images without making the Node application or Coolify volume responsible for file persistence.

- [ ] Create a dedicated RustFS bucket for Broadway Tracker.
- [ ] Create restricted credentials for only the bucket/actions the app needs.
- [ ] Configure `S3_ENDPOINT`, bucket, credentials, and region in Coolify secrets.
- [ ] Build a server endpoint that issues short-lived presigned upload URLs.
- [ ] Upload files directly from the browser to RustFS.
- [ ] Persist only the object key and safe metadata in Postgres.
- [ ] Add file-size, MIME-type, and image-dimension validation.
- [ ] Decide whether show covers and user-uploaded media are public or require signed read URLs.
- [ ] Implement image replacement and deletion without orphaning objects.
- [ ] Document RustFS backup/restore expectations separately from Postgres backups.

## 9. Styling, usability, and accessibility

**Goal:** A warm theatre-journal experience that remains clear and accessible.

- [x] Incorporate the **Collected Nights** design direction from the dedicated styling work.
- [x] Establish semantic color tokens, editorial typography, layout primitives, focus states, and responsive breakpoints.
- [x] Add initial reusable `ShowArtwork`, `Rating`, `ShowStatus`, `PrivacyBadge`, `AvatarGroup`, and `MemoryCard` primitives.
- [x] Ensure graceful cover-image placeholders and image-free layouts.
- [x] Build a responsive home-dashboard design preview around collected nights and trusted-circle context.
- [ ] Make quick-add and performance logging comfortable on mobile.
- [ ] Confirm keyboard navigation, visible focus styles, semantic headings, and form labels.
- [ ] Meet WCAG color-contrast expectations; never rely only on color for status or privacy.
- [ ] Test primary flows at mobile, tablet, and desktop widths.

## 10. Launch readiness

- [ ] Review environment variables: no secrets in Git, all production values stored in Coolify.
- [ ] Confirm email verification and password reset deliver successfully from the production domain.
- [ ] Confirm Google OAuth callback and sign-in work against the production hostname.
- [ ] Confirm database migrations run safely on deployment.
- [ ] Confirm Postgres and RustFS backups can be restored in a test environment.
- [ ] Run the full build, lint, typecheck, and test suite.
- [ ] Review privacy rules manually with two test accounts that are not friends, pending friends, and approved friends.
- [ ] Create initial admin account(s) and seed the first curated catalog records.
- [ ] Invite the first family/friend users.

---

## Deferred ideas

These are intentionally outside the MVP until the personal library and privacy model are reliable.

- Public profiles and public reviews
- Ticketing/calendar imports
- Notifications and email digests
- Cast, creative team, and venue database
- External show-data imports (must be evaluated for API terms and content licensing)
- Public image CDN/custom domain
- Mobile native applications
- Recommendations and discovery algorithms
- Comments or reactions on friends’ entries

## Commands reference

```sh
# First-time setup
cp .env.example .env
pnpm install

# Database
pnpm db:migrate
pnpm db:generate
pnpm db:studio

# App quality checks
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```
