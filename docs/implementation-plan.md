# Broadway Tracker — Implementation Plan

> **Purpose:** Living checklist for building Broadway Tracker. Check an item only after it is implemented and validated.
>
> **Product:** A private-by-default personal theatre library — Goodreads for Broadway, touring, regional, and local shows — for family and friends first.

## Guiding decisions

- **Audience:** Family and friends initially; designed to grow without becoming an engagement-driven social network.
- **Privacy:** Profiles default to **public** and everything a person makes inherits their profile
  setting unless they choose otherwise. The product is small, and an archive nobody can see gives
  nobody a reason to come back — so the default leans toward sharing. What makes that defensible is
  that **public is anonymous**: a public page carries no name and no handle, and is addressed by an
  opaque account id rather than anything derived from an email. Private remains one choice away on
  every item, changing a profile never rewrites what already exists, and a photograph offered
  publicly still waits for review before it reaches strangers.
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
- [x] Add a test runner and a `pnpm test` script. *(Vitest against an isolated `broadway_tracker_test` database, created and migrated automatically.)*

## 1. Local and production infrastructure

- [x] Add a Docker Compose development Postgres definition and `pnpm db:up` / `pnpm db:down` scripts.
- [x] Configure development `DATABASE_URL` through the host-published Coolify Postgres port.
- [x] Apply the initial migration with `pnpm db:migrate`.
- [x] Confirm `GET /api/health` returns `200 {"status":"ok"}` against the development database.
- [ ] Create a Coolify application connected to the Git repository.
- [x] Create or attach a Coolify Postgres resource.
- [ ] Configure Coolify environment secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, SMTP, and S3.
- [ ] Configure the Coolify health check as `GET /api/health`.
- [ ] Deploy the empty foundation successfully to a non-production/test hostname.
- [ ] Enable scheduled Postgres backups and configure an off-host backup destination.

## 2. Authentication and accounts

**Goal:** A user can safely create, verify, access, recover, and manage an account.

- [x] Configure Better Auth with the Drizzle/Postgres adapter.
- [x] Add the Better Auth API route/handler.
- [x] Create an SMTP mail transport from environment variables.
- [x] Implement email/password sign-up.
- [x] Require email verification before full account access.
- [x] Implement verification-email sending and resend flow.
- [x] Implement email/password sign-in and sign-out.
- [x] Implement a password-reset request and password-reset flow.
- [x] Add Google OAuth configuration behind `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- [ ] Create the Google Cloud OAuth client once the public hostname is known. *(Blocked on deployment.)*
- [ ] Configure the exact Google authorized redirect URI for the deployed hostname. *(Blocked on deployment.)*
- [x] Define safe account-linking behavior for users who sign in with both password and Google.
- [x] Add protected-route/session middleware and an authenticated application layout.
- [x] Build settings for name, handle, profile image, and default profile visibility.
- [ ] Add auth-flow and authorization tests. *(Authorization is covered across the server modules; the Better Auth flows themselves — sign-up, verification, reset — are not yet exercised.)*

## 3. Catalog and moderation

**Goal:** Users can find reliable show records without depending on an external catalog provider.

- [x] Build a public-to-signed-in catalog search interface for published shows.
- [x] Add title, type (musical/play/other), synopsis, and optional image metadata to the show detail screen.
- [x] Build the show-submission form for signed-in users.
- [x] Generate URL-safe slugs and handle title collisions.
- [x] Keep user-submitted shows in `pending` status by default.
- [x] Build a minimal admin review queue for pending submissions.
- [x] Let admins publish, reject, edit, and merge duplicate show records.
- [x] Add a production editor for Broadway, Off-Broadway, touring, regional, local, and other productions.
- [x] Seed a small initial catalog of popular shows after the admin workflow works.
- [x] Add tests for catalog visibility, submission, and moderation permissions.

## 4. Shared outings and memory model

**Goal:** Model a theatre night’s shared facts without taking ownership of an attendee’s personal response.

- [x] Add `outings` for shared show/production, venue, city, fuzzy date, and shared context.
- [x] Add `outing_attendees` for invitation state and attendee-owned rating, favorite, review, privacy, and private notes.
- [x] Support exact, month, year, approximate, and unknown date precision at the data-model layer.
- [x] Build server-side service functions that validate date precision and authorize attendee invitations.
- [x] Build the quick-log flow and make the creator an accepted attendee automatically.
- [x] Build the shared-memory detail page, separating shared facts from personal and private content.
- [x] Migrate/drop the legacy one-person `performances` table after the new logging flow is live.

## 5. Personal theatre library — MVP core

**Goal:** The user can build a satisfying private record of their theatre life.

- [x] Create a personal library page with Want to See, Seen, and Favorites views.
- [x] Let users add a published show to their library.
- [x] Let users update status: `want_to_see` or `seen`, with Favorite as an independent state.
- [x] Let users give an optional 0.5–5 rating and write a personal review/note.
- [x] Let users choose private or friends visibility per library entry.
- [x] Add a quick “log a performance” flow: date, production, venue, city, and private notes.
- [x] Support multiple performance logs for the same show.
- [x] Build a user-facing show detail page with their own library data and performance history.
- [x] Add filters, sort order, and empty states to the library.
- [x] Add server-side authorization checks for every library read/write operation.
- [x] Add tests for library status changes, privacy, ratings, and performance logging.

### Build Your Theatre History (backfill)

**Goal:** Reconstruct years of past theatre quickly, then enrich later — a separate flow from logging last night’s show (design brief §15).

- [x] Build a dedicated rapid-entry route with persistently focused search.
- [x] Add a date-precision step offering exact, month/year, year, approximate, and “I don’t remember”.
- [x] Make production, venue, and city optional behind a prominent **Skip for now**.
- [x] Return focus to search immediately after each entry.
- [x] Show an **Added today** queue so backfilling feels progressive.
- [ ] Verify a historical show can be added in roughly 5–10 seconds. *(Needs a real person at a keyboard; the flow is search → Enter → year → Add.)*

## 6. Lists and personal profile

**Goal:** Users can curate and revisit theatre memories beyond a single status list.

- [x] Create custom lists with title, description, and privacy setting.
- [x] Add/remove shows from lists and support ordering.
- [x] Build a personal profile page with library highlights and favorite shows.
- [x] Add useful, non-competitive personal stats (for example: shows seen by year or type).
- [x] Ensure profile and list pages honor each owner’s privacy settings.
- [x] Add tests for custom-list authorization and visibility.

## 7. Friends and friends-only sharing

**Goal:** Share thoughtfully with an approved inner circle, without public-social pressure.

- [x] Build friend search by handle.
- [x] Implement a send/cancel friend-request flow.
- [x] Implement incoming-request approval, rejection, and removal flows.
- [x] Enforce a single canonical friendship row per user pair.
- [x] Build a simple Friends page: requests, approved friends, and removal controls.
- [x] Allow friends to view only `friends`-visible profiles, entries, reviews, and lists.
- [ ] Build a quiet, chronological friends activity view (optional after core sharing works).

### Public sharing and the home dashboard

**Goal:** Give a signed-out visitor something real to look at, without publishing anyone’s name.

- [x] Add a third `public` visibility level for profiles, lists, and library entries/reviews.
- [x] Keep shared outings out of public sharing — a memory names other attendees who never consented.
- [x] Serve public lists and an anonymous public profile to signed-out visitors.
- [x] Make public pages carry no name, handle, or email-derived identifier.
- [x] Replace the home-page filler with real data for a signed-in user.
- [x] Give signed-out visitors a real landing page with clearly labelled sample content.
- [x] Wire the home page actions, which were dead buttons.
- [x] Replace the email-derived handle. People choose their own at sign-up with live availability; the fallback is built from the display name plus a random suffix, never from the address.
- [x] Do not add follower counts, public leaderboards, or engagement-pressure mechanics.
- [x] Add thorough privacy/authorization tests, including rejected and blocked relationships.

## 8. RustFS image storage

**Goal:** Add images without making the Node application or Coolify volume responsible for file persistence.

**Architecture:** RustFS listens on a private address reachable by the Node server and by Coolify,
but **not by users' browsers**, and the bucket has no public read access. Every byte therefore
travels through the backend in both directions — the app uploads on the user's behalf and streams
reads back out. Presigned URLs are not an option here: a signed URL would point at a host the
browser cannot resolve. This is more server work than direct-to-storage uploads, but it means an
object is only ever served after an authorization check, which suits a private-by-default product.

- [x] Create a dedicated RustFS bucket for Broadway Tracker.
- [x] Create restricted credentials for only this bucket and only the actions the app needs.
      *(Verified: cross-bucket access denied, own bucket read/write/delete intact.)*
- [ ] Configure `S3_ENDPOINT`, bucket, credentials, and region in Coolify secrets.
- [x] Build a typed storage client (endpoint, path-style addressing, no public URL).
- [x] Accept uploads at a server route that authorizes, validates, then writes to RustFS.
- [x] Serve reads through an authorizing backend proxy route that streams from RustFS.
- [x] Persist only the object key and safe metadata in Postgres.
- [x] Add file-size, MIME-type, and image-dimension validation; never trust the client's declared type.
- [x] Generate storage keys server-side so a user can never choose or traverse a path.
- [x] Apply the existing visibility rules to image reads, including the anonymous public tier.
- [x] Add caching/ETag handling so the proxy does not re-fetch an unchanged object every request.
- [x] Implement image replacement and deletion without orphaning objects.
- [ ] Document RustFS backup/restore expectations separately from Postgres backups.

> **Resolved.** The application's credentials were previously able to list every bucket on the
> RustFS instance, including `vaultwarden-backups`. They are now scoped to the single application
> bucket; a probe confirms cross-bucket reads are refused while the app's own read, write, and
> delete still work.

## 9. Styling, usability, and accessibility

**Goal:** A warm theatre-journal experience that remains clear and accessible.

- [x] Incorporate the **Collected Nights** design direction from the dedicated styling work.
- [x] Establish semantic color tokens, editorial typography, layout primitives, focus states, and responsive breakpoints.
- [x] Add initial reusable `ShowArtwork`, `Rating`, `ShowStatus`, `PrivacyBadge`, `AvatarGroup`, and `MemoryCard` primitives.
- [x] Ensure graceful cover-image placeholders and image-free layouts.
- [x] Build a responsive home-dashboard design preview around collected nights and trusted-circle context.
- [x] Make quick-add and performance logging comfortable on mobile. *(44px touch targets under `pointer: coarse`; paired date and place fields stack.)*
- [x] Confirm keyboard navigation, visible focus styles, semantic headings, and form labels. *(Global `:focus-visible` ring so a new control cannot ship without one; headings and labels audited across all 23 route files.)*
- [x] Meet WCAG color-contrast expectations; never rely only on color for status or privacy. *(Guarded by `tests/contrast.test.ts`.)*
- [ ] Test primary flows at mobile, tablet, and desktop widths. *(Every multi-column grid now has a responsive rule, verified by audit; a real device pass is still worth doing.)*

## 10. Launch readiness

- [ ] Review environment variables: no secrets in Git, all production values stored in Coolify.
- [ ] Confirm email verification and password reset deliver successfully from the production domain.
- [ ] Confirm Google OAuth callback and sign-in work against the production hostname.
- [x] Confirm database migrations run safely on deployment. *(`scripts/migrate.mjs` runs from the `start` script using runtime dependencies only; a failed migration stops the app rather than serving a schema-less database.)*
- [ ] Confirm Postgres and RustFS backups can be restored in a test environment.
- [ ] Run the full build, lint, typecheck, and test suite.
- [ ] Review privacy rules manually with two test accounts that are not friends, pending friends, and approved friends.
- [ ] Seed the first curated catalog records. *(Administrators are now set with `ADMIN_EMAILS` in the deployment environment rather than a script.)*
- [ ] Invite the first family/friend users.

## 11. Show imagery and contributed photos

**Goal:** Let a show look like something without depending on licensed marketing art, and let
people contribute their own pictures without turning a shared catalog record into an unmoderated
public wall.

Today a show without a cover renders a tonal block with its title. That is a deliberate floor, not a
placeholder, and it must keep working — but a show people have actually seen should be able to carry
their photographs.

**Model:** a `show_images` table — show, uploader, object key, visibility, created-at — rather than
more columns on `shows`. A show then has one admin cover plus any number of contributed images.

- [x] Add `show_images` with per-image visibility and review status, defaulting to private.
- [x] Let a signed-in user attach their own photo to a show. *(Server side; no UI yet.)*
- [ ] Show a user their own photo as that show's cover wherever it appears for them.
- [x] Build a gallery on the show detail page for contributed images.
- [x] Decide the cover-selection rule and make it **deterministic**: the viewer's own photo, then the administered cover, then the most recent approved public contribution.
- [x] Add a moderation path before a contributed image becomes public. *(Offered publicly reaches approved friends at once; everyone only after review.)*
- [x] Reuse the existing proxy: contributed images are authorized per image, like avatars.
- [x] Cascade deletion so removing a show or an account does not orphan objects.
- [x] Generate default artwork from the show's title instead of a flat colour block.
- [x] Build the upload UI on the show page and the contributed-photo gallery.
- [x] Apply the viewer's own photo as the cover on list and card screens, not only show detail. *(Batched into one extra query.)*

**Open question — variety without randomness.** Picking a cover at random per render would break
hydration (React re-renders the tree when server and client disagree, which is the bug class already
hit with the clock) and would stop a show from being recognisable — the same show would look
different on every visit, which works against a product built on memory. Deterministic alternatives
that still give variety across the catalog: the viewer's own photo first, then the admin cover, then
a stable pick among public contributions (most recent, or admin-featured). Variety then comes from
*different shows and different viewers* looking different, not from the same card changing.

**Open question — moderation.** A public contributed image appears on a shared record for everyone,
including signed-out visitors. That is the first surface in this product where one user can put
content in front of all others. Options: public requires admin approval, public is friends-only
until reviewed, or contributions stay private-only for now. The catalog already has an admin review
queue that this could reuse.

**Open question — photographs contain people.** Outing photos were kept out of public sharing for
exactly this reason. Contributed show photos may include the people someone attended with, so
private should stay the default and publishing should be an explicit, per-image act.

## 12. Catalog curation and administration

**Goal:** The catalog is filling up with records people entered themselves. Administrators need to
see what arrived, keep it tidy, and fix it — without that being a second job.

Show submissions already land in a `pending` queue with publish, reject, edit, and merge. What is
missing is everything around it: nothing tells an administrator that something is waiting, venues
have no equivalent path at all, and there is no single place to see what people have been adding.

- [x] Build one administration home that surfaces everything awaiting attention, with counts.
- [x] Surface a pending count in the navigation so a submission is not missed.
- [x] Extend the queue to cover venues and contributed photographs, not only shows.
- [x] Show provenance on a catalog record: who submitted it, when, and who reviewed it.
- [x] Let an administrator edit a published show without going through the review flow.
- [x] Add a duplicate-suspicion view that groups near-identical titles and venues before they spread.
- [x] Decide whether contributors are told when their submission is published or rejected. *(Both, by email. Delivery failures are logged, never allowed to undo the decision.)*
- [x] Keep the reviewing screens dense and quick; the design brief allows admin to be more
      functional than the rest of the product.

## 13. Member reports

**Goal:** Make it easy to say something is broken, and hard for that to be missed.

- [x] Let a signed-in member send a bug report or a feature request from any page.
- [x] Capture the page they were on, since that is the detail a reporter forgets.
- [x] Email every administrator when a report arrives.
- [x] Show open reports in the administration queue and in the navigation count.
- [x] Keep resolved reports readable rather than hiding them, and allow reopening.
- [ ] Let an administrator reply to a reporter from the queue.

## 14. Bulk catalog entry

**Goal:** Adding a batch of shows or a list of theatres should take a paste, not an evening.

- [x] Accept pasted JSON at `/admin/import`, administrators only.
- [x] Check a paste before writing anything, reporting what is new and what already exists.
- [x] Never overwrite: an existing record is skipped, so the same paste is safe to run twice.
- [x] Resolve venues through the same deduplication as the rest of the app.
- [x] Accept a bare array, a single object, and a venue list, not only the documented wrapper.
- [x] Refuse a document containing nothing to import rather than succeeding silently.
- [x] Document the format so it can be handed to a language model verbatim.
- [x] Warn about venues that resemble an existing one before anything is written.
- [x] Offer a one-click correction that rewrites the paste to use the existing venue.
- [ ] Let an administrator edit a production after import without going through the show screen.

## 15. Local and community theatre

**Goal:** A school production, a church hall, an amateur society — recorded as easily as
Broadway, without either being distorted to fit the other.

Much of this already works and should not be rebuilt: `productionType` already includes
`regional` and `local`, venues are created by members simply by logging a night there, fuzzy
dates handle a memory from decades ago, and a venue needs nothing more than a name.

What does not work is the shared catalog itself. It is curated, reviewed, and global — and a
community theatre's original revue, or a specific high-school staging, is none of those things:

- **A local staging of a known work has nowhere to live.** *Les Misérables* is in the catalog;
  the 2019 Lincoln High production is not, and only an administrator can add a production. The
  night is still recorded with its venue, but it cannot say *which* staging it was.
- **An original local work should not enter the shared catalog at all.** Submitting it means an
  administrator reviews and publishes a record only one family will ever use, and every such
  record makes the catalog worse for everyone else.
- **The review queue does not scale to this.** Somebody backfilling a childhood of school
  productions would generate a queue of submissions nobody else benefits from.

- [ ] Let a performance name a show that is not in the shared catalog, without a submission.
- [ ] Decide where such a record lives: personal to the logger, or shared with their friends.
- [ ] Let a member add a local or regional production of a catalog show without administrator review.
- [ ] Keep unreviewed local records out of catalog search, so the shared archive stays curated.
- [ ] Offer promotion: an administrator can lift a local record into the shared catalog if it
      turns out to be of general interest.
- [ ] Review the logging copy, which currently assumes a professional production.

**The tension to resolve first.** Everything else here follows from one decision: whether a
locally-entered show is *private data that happens to look like catalog data*, or *catalog data
with a smaller audience*. The first keeps the shared archive clean and makes local entry
instant; the second means two families who saw the same school production can share it. They
pull in opposite directions and the answer shapes the schema.

## 16. Mapping

**Goal:** See where you have seen theatre — a map of a life's theatregoing, not a utility.

Venues already carry a name, city, and country, which is enough to place them roughly but not
to plot them. Nothing stores coordinates.

- [ ] Add coordinates to venues, populated by geocoding rather than by hand.
- [ ] Choose a geocoding source and a tile provider, and record their terms.
- [ ] Show a venue's location on its page.
- [ ] Build a personal map of everywhere the reader has seen a performance.
- [ ] Consider a friends view: where the people you share with have seen theatre.
- [ ] Fall back gracefully: a venue that cannot be geocoded must not break the map or the page.
- [x] Decided: no public map. A personal map, and possibly a friends one; never on the
      anonymous public profile.

**Privacy is the whole question here.** A map of where somebody has been, with dates, is far
more revealing than the same facts listed as text — it shows patterns, a home city, a routine.
That argues for the personal map being private by default and never part of the anonymous public
profile, whatever the individual entries' visibility says. Venue coordinates themselves are
public facts about buildings and carry no such weight.

**Also worth checking:** tile providers and geocoding services usually require attribution and
often prohibit bulk geocoding or caching. Whatever is chosen, the terms need reading before it
goes in — the same care already applied to catalog imports.

## 17. People: cast and creative team

**Goal:** Record who was on stage, so a memory can hold *the night Alex Brightman played Josh*
— and so a performer becomes something you can follow through your own history.

This is the largest remaining gap between the data and what a theatregoer actually remembers.
It is also the one most likely to be wrong if guessed at, because casts change constantly:
understudies, replacements, and limited runs mean the answer depends on the *date*, not the
production.

**Model:** a `people` table, and a `castings` join carrying the role and the dates that person
held it. A performance then resolves its likely cast from the date it happened.

- [x] Add `people` (name, optional disambiguating note) with normalisation and an administrator
      merge, the way venues work. *(`/admin/people`: suspected duplicates with a choice of which
      name survives, a rename, and a fold-into picker for anyone the suspicion list missed.)*
- [x] Keep entry open-ended: any name may be typed, and existing people are offered first.
- [x] Add `castings`: person, production, role, `startedOn`, `endedOn`, principal, and whether
      the role is on stage or behind it.
- [x] Show the cast on a production, ordered with principals first.
- [x] Build a person page listing their roles, and the nights the reader saw them. *(`/artists/$id`;
      `/people/$handle` was already taken by friend profiles.)*
- [x] Resolve *who you probably saw* from a performance's date against the casting dates, and
      say plainly that it is inferred rather than recorded. *(Exact dates only; performers only.)*
- [x] Let a member correct or confirm who they actually saw on their own outing.
- [x] Extend the catalog import format to carry cast, and warn on near-duplicate names.
- [x] Carry members' recorded cast through a merge. *(`seen_performers` cascades from `people`, so
      the old merge discarded by hand what members had entered.)*

**Open question — inference versus record.** Matching a date against a casting window gives a
good guess, not a fact: an understudy went on and nothing in the data will ever say so. The
honest treatment is to show it as *likely* and let the attendee confirm or correct it, the same
way a fuzzy date is shown as approximate rather than rounded to something exact.

**Open question — how much creative team.** Director, choreographer, book, music, and lyrics are
production-level and stable, so they are much easier than cast. They may be worth doing first as
a smaller, safer slice.

## 18. Places: venues and cities

**Goal:** Stop the same theatre and the same city from being recorded four different ways.

Place text is stored twice — on `productions` and on `outings` — as free text with no shared
vocabulary, so drift compounds across both. There is already a `NYC` in the data.

- [x] Add first-class `venues` (name, city, country) rather than more free text.
- [x] Let a production and an outing reference a venue, keeping free text as a fallback.
- [x] Build an autocomplete that offers existing venues before allowing a new one. *(Logging and backfill both use it.)*
- [x] Normalise on write so near-duplicates collide, including city aliases such as NYC and New York City.
- [x] Give administrators a venue merge tool, mirroring the existing duplicate-show merge.
- [x] Backfill existing free-text venues and cities onto the new entities. *(`pnpm db:backfill-venues`, idempotent.)*
- [x] Keep entry fast: suggestions are debounced and free text is still accepted.

- [x] Build a venue page listing every show and performance recorded there, linked from a
      show's production and from a logged memory.

This also unlocks the *Favorite venues* and *Cities* views listed under Stats in the design brief,
which free text cannot support, and it gives the assisted-recall idea below something to resolve
candidates against.

---

## Deferred ideas

These are intentionally outside the MVP until the personal library and privacy model are reliable.

- Ticketing/calendar imports
- Notifications and email digests
- Cast, creative team, and venue database
- External show-data imports (must be evaluated for API terms and content licensing)
- Public image CDN/custom domain
- Mobile native applications
- Recommendations and discovery algorithms
- Comments or reactions on friends’ entries

### Assisted recall for vague memories (exploration)

**The idea:** a user remembers *“I saw The Music Man, I think in Boston, around 1990.”* Offer an
assisted lookup that searches for real productions matching that fuzzy description and proposes
concrete candidates — venue, run dates, touring company — for the user to confirm.

This would slot into the **Build Your Theatre History** backfill flow and the quick-log flow, as an
optional “Help me remember” action beside the date-precision step. It is a natural fit for the fuzzy
date model already in place: the answer to *“which production was that?”* is exactly what turns an
`approximate` memory into an `exact` one.

Open questions, roughly in the order they need answering:

- **Trust.** This product is a personal archive; a confidently wrong venue or year is worse than a
  blank field. Any result must arrive as a *suggestion the user confirms*, never an auto-filled
  value, and the UI should show what it matched on so a wrong guess is obvious.
- **Provenance.** Candidates should cite where they came from, and the app should record whether a
  performance detail was user-entered or accepted from a suggestion.
- **Sources and licensing.** Production archives (Playbill, IBDB, IOBDB, regional theatre archives)
  each have their own terms. This has the same licensing question as the existing *External
  show-data imports* idea above and should be evaluated alongside it.
- **Privacy.** The query is a fragment of someone’s personal history. Sending it to an external
  provider needs to be disclosed, opt-in, and ideally scoped to just the show/place/year rather than
  any personal note attached to the memory.
- **Cost and latency.** Per-lookup cost and response time decide whether this is a background
  enrichment or an interactive step; the 5–10 second backfill target leaves little room for a slow
  synchronous call.
- **Model and provider.** Unevaluated. Also unclear whether this is better served by a search-backed
  lookup with a model summarizing results, or a model with browsing/tool access.
- **Graceful failure.** Regional, school, and community productions are poorly documented. The flow
  must stay fast and pleasant when nothing is found, which is the common case for exactly the
  memories users most want help with.

## Commands reference

```sh
# First-time setup
cp .env.example .env
pnpm install

# Database
pnpm db:migrate      # development, via drizzle-kit
pnpm migrate         # what the deployment runs; runtime dependencies only
pnpm db:generate
pnpm db:studio
pnpm db:seed-catalog
pnpm db:grant-admin <email>

# App quality checks
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test          # vitest against broadway_tracker_test
pnpm test:watch
```

## Testing notes

- Suites run against an isolated `broadway_tracker_test` database. `tests/setup.ts`
  creates and migrates it on first run and refuses to run against any other database,
  because each suite truncates every table.
- Authorization lives in exported `createServerOnlyFn` helpers that take the acting
  user explicitly (`listForViewer`, `areFriends`, `reviewShowAsAdmin`, …). Server
  functions are thin adapters that resolve the session and call them, so the rules
  can be tested without a request. `createServerOnlyFn` also keeps the database
  client out of the browser bundle.
