# Writing, and what the home page becomes

A plan, not a commitment. Nothing here is built.

The goal is more reason to open the app between theatre trips. The instinct —
a feed, and something longer than a review to write — is right. The shape it
should take is decided almost entirely by one number.

## The supply problem

Today: 2 members, 4 outings, 1 written review.

Suppose this reaches the size it is actually built for — fifteen family and
friends — and everybody sees six shows a year. That is ninety outings a year,
or **1.7 a week across the entire app**. Reviews on half of them. Perhaps one
or two pieces of writing a month, from the two or three people who write.

Call it three or four items a week, on a good week.

A feed sorted by recency, at that rate, is empty four days out of seven. And an
empty feed does not read as "quiet" — it reads as abandoned. It is worse than
no feed, because it makes the app look like it failed rather than like it is
small on purpose.

So the design question is not "how do we build a feed". It is:

> **Where does enough substance come from, at fifteen people, that opening the
> app on a Tuesday is worth it?**

## Where content can actually come from

Ranked by what it yields against what it costs.

### 1. Things already recorded, resurfaced — free, and the biggest win

Nothing new is written. The database already holds decades of theatre once
people backfill.

- **On this day.** "Three years ago tonight you saw *Hadestown* at the Walter
  Kerr." One person's own history, needing no other member to do anything. This
  is the single highest yield per unit of effort in this whole document, and it
  works on day one with two members.
- **Shared history surfacing.** "You and Sarah have both seen *Six*." The app
  knows this and never says it. It is the strongest prompt to talk to somebody
  that exists here.
- **Reviews, which are written and then buried.** A review currently lives on
  one outing page and is visible essentially nowhere else. Surfacing friends'
  reviews is new content that costs nothing to produce because it already
  exists.
- **A show you have seen is staged again.** The catalog knows when a new
  production of something in your history appears.

### 2. Writing — the only source that scales without attendance

Everything above is bounded by how much theatre people actually see. Writing is
not. One person with something to say produces material on a week when nobody
went anywhere.

This is why the instinct about articles is correct, and it is worth being
precise about who writes and why:

- **Editorial, by an administrator.** "What is opening this spring." "How to
  add a show you saw in 1994." This is also the only honest fix for the
  signed-out home page, which currently shows *labelled sample content* because
  there was nothing real to show. A public article is something real.
- **Members, at length.** An essay about a production, a season, a theatre, a
  performer. The natural extension of a review that outgrew its box.

### 3. Catalog activity — low value, do not bother

"A new production was added." Nobody opens an app for this.

## The model for writing

### A post is about something

Every post should attach to a **show, production, venue, artist, or outing**,
with unattached pieces allowed but not the default.

This is what keeps it a theatre journal rather than a general blog nobody
maintains. It also means every post has somewhere to live besides a
reverse-chronological list: a show page can carry the essays written about it,
a venue page its history. That is the difference between writing that
accumulates into an archive and writing that scrolls away.

### Reviews and posts stay separate

A review is a field on an attendee row: your reaction to one night, with its
own visibility, sitting beside your rating and your private notes. It is right
as it is. A fifteen-hundred-word essay does not belong in that column, and
merging the two would force one shape onto both.

Instead: **promote**. A review gains a "make this a piece" action that opens
the editor with the review as its first paragraph and the outing already
attached. The review stays where it was. That gives the path from short to
long without collapsing two things that have different lifecycles — a review
is finished the night you write it; a piece can be edited for years.

### Drafts are the point

Anything with a title needs a draft state. A review is written in one sitting;
a piece is not. Publish is a deliberate act, and the difference between "saved"
and "published" is what makes people willing to start.

## The conflict worth deciding carefully

**The public tier is deliberately anonymous. A byline is the opposite of that.**

Public profiles carry no name, no handle, and an opaque id in the URL. That was
a deliberate decision and the privacy review enforced it. But nobody reads an
unsigned essay, and an author who writes one wants their name on it.

Worse, the two surfaces leak into each other: if a public post is bylined and
links to the author's public profile, then publishing one essay attaches a real
name to their entire public shelf. A member would not expect that, and would
not see it happening.

Three ways out:

1. **Posts are never public**, friends-only at most. Preserves anonymity
   perfectly, and gives up the editorial fix for the signed-out page.
2. **Public posts carry a byline and link to the profile.** Simple, and quietly
   deanonymises the author's whole public presence the first time they publish.
3. **Public posts carry a byline that does not link to the profile**, with the
   author choosing per-post what name to publish under. The essay is signed;
   the anonymous shelf stays unlinked.

Option 3 is the recommendation. Anonymity should protect what somebody did not
choose to publish; publishing an essay is a choice, made once, per piece, with
the consequence stated at the moment of publishing.

## What the home page becomes

**A front page, not a feed.** The word matters. A feed implies recency ordering
and infinite scroll, which at three items a week looks broken. A front page is
*composed*: it can mix things of different ages and still feel full and
deliberate.

Something like, in order:

1. **Anything genuinely new** since last visit — a friend's night, a review, a
   published piece. Whatever exists, however little.
2. **The latest editorial piece**, if there is one.
3. **From your own history** — the anniversary, the show being staged again.
   This never runs out, and it is entirely yours.
4. **Something to do** — the show three friends have seen and you have not, the
   night you logged without a venue, the performance missing its cast.

Sections that have nothing simply do not render. On a quiet week the page is
shorter, not emptier — it does not announce that nothing happened.

Existing surfaces stay: `/circle` remains the pure chronological friends view
for anyone who wants it, and the front page does not replace it.

## What not to build

The brief is explicit, and these would all raise interaction while making the
app worse:

- Follower counts, popularity rankings, streaks, "trending"
- Likes, or any number that measures a person
- Notifications for anything other than something addressed to you

**But responses matter.** The reason people stop writing in a small community is
that nobody answers. The theatre-journal version of a response is not a like:

- **"I was there too"** already exists and is exactly right — substantive, and
  it changes the record rather than scoring it.
- **Replies on a piece**, friends-only, no count shown anywhere. A reply is
  writing, which is the thing this app is for.

## Suggested order

**First — resurface what exists. Done.** On this day, who else has seen it,
and reviews, composed onto the front page. No new content types and no schema
change: every one of these is a read over data that was already there.

Decided while building: **public means public.** A review or a shelf entry
marked public reaches any member, friend or not; friends-only still reaches
approved friends. Restricting resurfaced material to a reader's own circle
would have made a small archive smaller, and the whole point is that what
somebody chose to share openly can be found.

**Second — posts. Done.** Table, editor, drafts, attachment to a subject,
visibility following the profile. Editorial is a flag on the same object rather
than a separate system: a piece written by an administrator is editorial.

Decided while building: **a piece is plain paragraphs.** Blank lines separate
them and nothing else is interpreted. Markdown would ask family who have never
seen it to learn a syntax to write a sentence, and interpreting member-written
text as markup is a hole better kept shut.

**The byline is kept apart from the account.** A reader is given the name the
author chose for the piece and never their account name, and the byline links
nowhere. Publishing an essay therefore does not attach a real name to
everything else that person has marked public.

**Third — promote a review (done), and replies (not yet).** "Make this a piece"
opens a draft holding the review, attached to the same show and night, and
leaves the review where it was written.

**Fourth — the composed front page**, drawing on all of it.

The order matters: step one alone probably delivers most of the interaction
gain, and it is the cheapest thing here. Posts are the larger build and they
are worth doing, but a front page that only had posts on it would be empty
until somebody wrote something.

## Built: a reminder for people who have drifted

The idea: an occasional email to somebody who has not visited — an anniversary,
a piece they have not read, a friend's night they missed. A profile setting,
defaulting to on.

It is cheaper than it sounds, because **it is the front page in a different
envelope.** `anniversariesFor`, `recentReviewsFor`, `sharedHistoryFor` and the
posts listing already assemble exactly this, already respect each item's
sharing, and are already tested. The digest is a template and a schedule over
queries that exist.

How it works:

- `user.lastActiveAt`, written from the navigation's own round trip and only
  when the record is more than an hour stale, so reading a page is not a write.
- `POST /api/digest`, guarded by `DIGEST_SECRET` and refusing outright when
  that is unset. `?dryRun=1` assembles everything and sends nothing, so a
  schedule can be pointed at production and inspected first. A cron on the host
  calls it; nothing needs a job runner.
- `GET /api/digest/stop?token=…` unsubscribes with no login, and answers
  identically for a token that means nothing.

**Learned by nearly doing it:** every account that predates `last_active_at`
has NULL there, which reads as "never seen" — so the first scheduled run would
have written to every member at once, including daily users. A data migration
starts the clock at deploy. NULL keeps its meaning for accounts created
afterwards, where it genuinely means somebody signed up and never came back.

The decisions that matter more than the plumbing:

- **Only send when there is something to say.** An empty digest is the empty
  feed problem again, and worse: a feed nobody opens is ignored, an empty email
  is a reason to unsubscribe. If the queries come back with nothing, send
  nothing.
- **Only to people who have actually drifted.** Somebody who visits every
  Sunday should never receive one. This is a nudge, not a newsletter, and the
  difference is whether it is conditional on absence.
- **Weekly by default** (decided against the original suggestion here). The
  thin-letter worry is answered by never sending an empty one: a quiet week
  produces silence rather than a paragraph of nothing, and skipping does not
  reset the clock, so the next week is considered as soon as there is anything
  to say. Monthly remains an option.
- **Anniversaries are the reliable part.** Everything else depends on other
  people having done something; a person's own history does not. That is what
  makes this work at fifteen members rather than fifteen hundred.

## Open decisions

- How is a piece written? Markdown is natural for a small app and a barrier for
  family who have never seen it. A plain textarea that treats blank lines as
  paragraphs, with markdown honoured if used, is probably the honest middle.
- Do public pieces need review before publishing, as public photographs do? At
  fifteen known people, probably not — but an administrator needs to be able to
  unpublish.
- Does an anniversary need to be opt-out? "Three years ago tonight" is lovely
  until it surfaces a night somebody would rather not be reminded of.
