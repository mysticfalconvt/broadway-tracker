# Working on Broadway Tracker

A personal theatre journal and shared archive. Read this before changing
anything; most of it was learned by getting it wrong first.

## What this is

A private app for one family and their friends — fifteen people, not fifteen
hundred. That number decides more design than anything else: features that need
volume to feel alive will feel dead here, and the app is composed rather than
fed for that reason. See `docs/writing-and-the-front-page.md`.

The design brief rules out follower counts, popularity rankings, streaks,
engagement bait, and infinite activity feeds as the main experience. Those are
constraints, not suggestions.

## The stack

TanStack Start · React 19 · Postgres via Drizzle · Better Auth · Biome ·
Vitest. Deployed on Coolify/Nixpacks at `broadway.rboskind.com`, migrations run
from the `start` script.

## Verifying work

```sh
pnpm test        # vitest against an isolated broadway_tracker_test database
pnpm lint        # biome
pnpm typecheck   # tsc --noEmit
pnpm exec vite build
```

**Check exit codes, not output.** `tsc --noEmit | head -4 && echo clean` always
prints "clean", because a pipeline's status is `head`'s. `biome check . | tail -2`
hides the error count in the same way. Both of those produced false "all clear"
reports in this repo before anybody noticed. Redirect to a file and read `$?`.

There is a dev server on `http://10.0.0.104:3000` and a Mailpit sink at
`http://10.0.0.50:8025` catching all outbound mail. Verifying over HTTP with a
real signed-in account has caught things the test suite could not — a session
resolved wrongly during SSR, a bundler dropping a stylesheet, a payload leaking
a user id. Do it for anything user-facing, then delete the test accounts.

## Conventions that are load-bearing

**Server-only code must be wrapped.** `createServerOnlyFn` is what strips a
function body from the client bundle. A plain exported helper that touches the
database will pull `postgres` into the browser build and break it with
`"performance" is not exported by "__vite-browser-external:perf_hooks"`.

**Test the core, not the server function.** `createServerFn` handlers cannot be
invoked from vitest — there is no Start transform, so the handler is `undefined`
and the test passes vacuously. Export a core that takes an explicit actor or
viewer id, test that, and keep the server function as a thin adapter.

**Identity comes from `src/server/session.ts`.** `currentSession()` is the only
place that asks Better Auth who the caller is. Read-only impersonation is
enforced there, so anything that resolves a session another way silently opts
out of it. Do not reintroduce direct `auth.api.getSession` calls.

**Sessions during SSR.** `authClient.useSession()` is empty on the server, and
`isPending` is not reliably true. Resolve the session in the route loader and
fall back to it: `clientSession ?? serverSession`. Getting this wrong shows
"Sign in" to somebody who is signed in, for one frame.

**Better Auth defaults win over the column default.** `additionalFields`
`defaultValue` is applied by the library and overrides both the database default
and the synthetic-user hook, so all three must agree. This silently broke
public-by-default once. `tests/auth-config.test.ts` now fails if they drift.

**Drizzle correlated subqueries.** Interpolate the table and write the column
out by hand: `sql\`select count(*) from ${outings} where ${outings}."venue_id" =
${venues}."id"\``. Interpolating a column reference renders it unqualified,
which silently correlates against itself and counts zero, or everything.

**Reading forms.** Use the helpers in `src/lib/form.ts`. `String(form.get(x))`
returns the string `"null"` for an absent field, which is truthy and reaches the
server as real data. Four of five date precisions were broken this way.

## The sharing model

One setting on the profile governs everything, and changing it **moves existing
content** that was following it. Anything set explicitly on its own item stays
put. Photographs are excluded, because a public one re-enters moderation.

Rules that have been got wrong more than once:

- **Public is more open than friends, not different from it.** Matching
  `visibility = 'friends'` exactly hides public content from the very people it
  was shared with. Use `inArray(column, ['friends', 'public'])`.
- **New content follows the profile.** A form that posts a concrete value stops
  the server's fallback from ever running, which pins items to a level the
  person never chose. Post nothing to mean "follow my profile".
- **The public tier is anonymous** — no name, no handle, opaque ids in URLs. A
  byline on a piece is the deliberate exception, and it never links to the
  profile.

## Scratch scripts point at real data

`DATABASE_URL` in `.env` is a **working database with real accounts in it**, not
a scratch one. `pnpm test` is safe because `tests/setup.ts` rewrites the URL to
`broadway_tracker_test` before anything loads; a `.tmp.ts` file run with `tsx`
gets no such treatment, and `getDb()` there is pointed straight at the real one.

A debugging script did exactly this: it truncated the development database —
every account, every night, every show — while chasing a failing test. There was
no WAL archiving and no dump on the host, so none of it came back.

- Never issue `truncate`, `delete` without a `where`, or `drop` from a scratch
  script. If a test needs a clean database, run it under vitest.
- `tests/helpers.ts` now refuses to load unless `DATABASE_URL` names the test
  database, so importing the fixtures outside vitest throws instead of wiping
  something.
- Prefer reading. A debugging script that only selects cannot cause this.

## Traps in the tooling

- **The route generator can re-scaffold a route file** while the dev server is
  watching and you are writing to it. A 600-line route was replaced with a
  nine-line stub mid-edit. Check the file after scripted writes to `src/routes`.
- **`tsx -e` fails silently** in this environment. Write a temporary `.ts` file
  and run it with `pnpm exec tsx`, and read the output.
- **`grep` is `ugrep` here** and fails quietly on some patterns. Python is more
  reliable for asserting against HTML.

## How changes are made here

Every guard added gets a test, and then the guard is **broken on purpose** to
watch that test fail. This has repeatedly found tests that passed for the wrong
reason: a stranger test where the reader had no friends at all, so an early
return fired before the rule under test; an anniversary guard that was redundant
because the writers already nulled the field. If a mutation does not fail
anything, the test is documentation, not coverage — say so rather than counting
it.

Data belongs to people. Prefer refusing to destroying: merges move records
rather than cascade-deleting them, moderation cannot orphan a member's night,
and a migration that would email everybody at once is a bug even if every line
of it is correct.

## Where things are

```
src/server/      one module per area; cores take an explicit actor
src/server/db/   schema.ts, migrations/
src/routes/      file-based; _protected/ requires a session
src/lib/         pure helpers, safe on the client
tests/           one file per area, against a real Postgres
docs/            architecture, backups, catalog import, the plan, design notes
```

`docs/implementation-plan.md` is the running record — 186 items done, 6 open,
each with a note on what was decided and why.

## The MCP layer (`/api/mcp`)

A member mints a key at `/keys`; `actorForToken` turns it into a user row and
everything downstream is the code the website already runs. Points worth knowing
before changing it:

- **A key is its owner, with no separate scopes.** Do not add a permission
  column. If a key should not be able to do something, the member should not be
  able to do it either, and the guard belongs in the function they both call.
- **`writes: true` on a tool is not itself the guard.** The guard is that
  callers must pass `allowWrites`. `/ask` does not, which is why its local model
  cannot log a night. `tests/api-keys.test.ts` holds both halves.
- **Only the SHA-256 of a token is stored.** Plain SHA-256 rather than a
  password hash is deliberate: 160 bits from a CSPRNG has no dictionary to run.
- Tokens are shown once. Nothing can recover one afterwards.
- **A member's key is wider than the website, on purpose, in one place.** It can
  add productions and cast to any published show; no member-facing screen adds a
  casting at all. That is the layer's whole point — fifteen people filling a
  catalog that is otherwise empty — and what stands behind it is a light rather
  than a gate: every row carries `createdByUserId` and a `source`, and
  `/admin/contributions` lists them newest first, so a bad run reads as a run.
  If you gate this later, gate it in `addCasting`, where both callers meet.
- **A caller may correct what it entered.** `castings.createdByUserId` is the
  test, with admins able to correct any. An append-only API hands somebody a way
  to make a mess and no way to clear it up, and bulk entry is where the mess
  comes from. Deleting a casting withdraws a claim about a stage; it never
  touches `seen_performers`, which is a member's own word about their own night.

## Return engagements

A casting is unique on person + role + **start date**, not person + role. Somebody
who opens a show, leaves, and comes back for an anniversary cast has two stints
and needs two rows. Deduplicating harder than the world does forces the only
available row to be true of both, which means leaving its dates off — and an
unbounded casting then covers every night in the run, including the years they
were away. Two rows with no start date at all are still one: there is nothing to
tell them apart, and treating them as separate invents an engagement out of a
missing field.

## Two performances in one day

A matinee and an evening are two nights out, and so are the two parts of a show
that comes in two. Log each separately and set `outings.curtain` — a clock time,
no date and no zone, because a two o'clock matinee is two o'clock where the
theatre is. It is dropped unless the date is exact: a time on "some time in the
nineties" reads as though it says something.

This is not tidiness. A matinee is when an understudy goes on, so the two
performances often had different people in them, and the cast inference was
answering identically for both.

## Images: sizes and covers

**`sharp` is a native module and must never be imported at module scope.** Its
binary is chosen per platform and a build can ship the package without it — and
an import that throws while the server is loading takes down the entire
application, not the feature. It did exactly that in production. It is loaded
lazily inside `imageAtWidth`, its failure is caught, and the route falls back to
serving the original. `vite.config.ts` also keeps it out of the bundle
(`rolldownConfig.external`) so it resolves from `node_modules` at run time,
where the platform binary is. Both, deliberately: the config makes it work, the
lazy import makes a broken config survivable.

A resized copy is derived the first time a size is asked for and then kept, at
`key@width.webp` beside the original. Resizing per request repeats the work
forever; making every size at upload does work nobody wants and needs a backfill
for everything already stored. `THUMBNAIL_WIDTHS` is closed — a width from the
query string would be one request per pixel filling the bucket.

Only ever pass the **original** key in a URL, with `?w=`. The authorization
check reads that key, so there is one thing to authorize and no way to address a
copy of something you may not see.

A cover is a row in `cover_choices` (reader, show, image), not a flag on the
photograph: a photograph belongs to whoever took it, and a cover belongs to
whoever is looking. Any image the reader can see may be chosen, including a
friend's. Falling back, in order: their choice, their own newest, a visible
friend's newest, the catalog's. Visibility is checked when a choice is set *and*
when it is read, because a friendship can end after the choice was made.

## Linking a Google account to an existing one

`disableImplicitLinking: true` is the guard that matters: a provider identity is
never attached on the way *in*, only from a session that is already
authenticated. Without it, signing in with a provider whose email happened to
match an existing account would hand that account over, and whether the provider
verified the address is the provider's business rather than ours.

`allowDifferentEmails: true` is safe **only** because of that. People keep an
address they use and a Google account they log in with, and requiring the two to
match refuses the person it would help most. Turning it on while implicit
linking was allowed would be an account-takeover route — do not separate them.

`disconnectWayIn` refuses to remove the last one. The consequence is not "a
provider is disconnected", it is somebody shut out of years of their own
evenings with the account still there and no door left in it.

## Renamed theatres

A building outlives its name. The Brooks Atkinson became the Lena Horne in 2022,
and the two records had nothing connecting them. One record per **building**,
with `venues.formerNames` carrying what it used to be called; `findOrCreateVenue`
falls back to those, and `mergeVenues` is how a rename gets recorded — the name
merged away is kept rather than discarded. The name a production displays is
still whatever was typed at the time, because that lives on the production.

## Covers and understudies

`likelyCastOn` infers from casting dates, which cannot know an understudy went
on. `seen_performers` is the override, and it is **per role**, not per night:
recording one cover supersedes that role and leaves the rest of the inference
standing. It works from a **window**, not a day: `dateWindow` turns "August
2007" into its real first and last day, and a performer is offered only if their
tenure covers every day of it. Requiring an exact date meant the app told people
never to record a guessed one and then silently withheld the cast from everybody
who listened. Anyone overlapping only *part* of the window comes back separately
as **possible**, never folded in: somebody who joined mid-month is weaker
evidence and stronger information, and is precisely who a whole-window rule
throws away. Roles are compared through `normalizeRole`, never as raw strings:
they are written from three places and one of them decoded entities while the
others did not, so a cover recorded as `Johnny Bevan &amp; Others` matched
nothing and the billed performer went on being offered. It used to replace the whole night's guess, which punished the single
commonest correction by reducing a twelve-person company to one name.
