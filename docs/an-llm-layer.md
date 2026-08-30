# Asking the app in words

Ideas, not a plan. Nothing here is built.

The prompt that started this:

> *I went to see The Producers around 2003ish. Tony Danza was in it. Can you
> narrow down when that was and log it for me.*

## The query half is easy. The catalog is the problem.

`likelyCastOn(production, date)` already answers "who was on stage that night",
and the sentence above needs the same table read backwards — *given this person
in this production, what dates could it have been*. That is a `select`.

Which is a completely useless observation, because the data is not there:

```
shows                       21
productions                  8
castings                    11
shows with a dated casting   2
```

*The Producers is not in the catalog at all.* Neither is Tony Danza. The query
is trivial and answers nothing, because a query over an empty table is empty.

So web research is not an alternative to the in-app idea. **It is the thing
that makes the in-app idea possible**, and everything below follows from that.

Two smaller points survive:

**The app should sometimes disagree with the sentence.** Once the castings do
say Danza played Bialystock in the winter of 2006, "around 2003" is not vague,
it is *wrong*, and the honest answer says so rather than quietly picking a date
in the middle of the decade. Same instinct as fuzzy dates: never invent
precision somebody did not have.

**Somebody still has to be right about the facts.** Moving the guessing from
the member to a model does not remove it, it relocates it — see provenance,
below.

## One capability, two front doors

In-app and MCP are not alternatives. Both need the same underlying thing — a
small set of well-shaped functions the model can call — and that layer is the
whole job. Once it exists, exposing it to a local model in a text box and to an
external client over MCP is two thin adapters.

A first set, which mostly wraps things that already exist:

| Tool | Already exists as |
| --- | --- |
| `findShow(title)` | `searchCatalog` |
| `findPerson(name)` | `searchPeople` |
| `whenWasTheyIn(show, person)` | **new**, the inverse of `likelyCastOn` |
| `productionsOf(show)` | `publishedProductionsForShow` |
| `venuesNamed(text)` | `suggestVenues` |
| `proposeOuting(...)` | a draft, never a write |
| `myOutings(showId)` | `outingsForUserAndShow` |

Few tools, sharply shaped, is also what makes a local model workable. A
120-billion-parameter model asked to pick between seven obvious functions is
reliable; the same model asked to invent a plan across thirty is not.

## Fill the catalog where it is actually used

The obvious move is to pre-seed: research a few Broadway decades, import them,
then everything works. That is a lot of effort spent on shows nobody in this
family ever saw, and it is never finished.

The better trigger is the question itself. **Asking about The Producers is what
causes the app to go and learn about The Producers.** The catalog then grows
exactly where it is used, driven by real demand, and every question anybody asks
leaves the archive better for everybody else. Fifteen people asking about the
shows they actually attended will produce a small, dense, relevant catalog far
faster than any seeding plan.

## The decision that matters: what leaves the house

This is a private journal for one family, so the split is not local versus
hosted for cost or speed — it is that **a hosted model means somebody's theatre
history, and their friends' names, leave the building.**

My first sketch drew that line between the two front doors, which was too
coarse. The line runs *through the middle of a single request*:

> ~~I went to see~~ **The Producers, around 2003. Tony Danza was in it.**
> ~~Log it for me.~~

The bold half is public record — a question anybody could ask about a Broadway
run. The struck-through half is somebody's private evening. So the request is
decomposed rather than routed:

1. **Locally**, extract what is being asked about. A show, a person, a rough
   year. No web needed, nothing personal leaves.
2. **Outward**, ask only the public question: *when was Tony Danza in The
   Producers?* No name, no account, no journal — a question about theatre
   history that reveals nothing about who is asking.
3. **Into the catalog**, as sourced facts, available to everybody.
4. **Locally again**, propose the outing against the newly-filled catalog. The
   private half never left.

The same decomposition is what makes an MCP server useful: pointed at catalog
work, it is asking public questions about public record.
`docs/catalog-import.md` was already written to be handed to a language model
verbatim; MCP is that seam with the copy-and-paste removed.

## Rules that would keep this honest

**Propose, never write.** The model drafts; a person confirms. Especially here,
where the input is a half-remembered evening from twenty years ago and the
output is a permanent record. A draft outing shown for approval is also a much
better failure mode than a wrong one silently created.

**Never narrow beyond the evidence.** If the cast data gives a three-month
window, the proposal is a three-month window — `datePrecision: 'approximate'`,
not a date. The fuzzy-date model exists for exactly this and the model should be
made to use it rather than route around it.

**Say what it used.** "Tony Danza played Bialystock from 21 December 2006 to 11
March 2007, so it was probably then, not 2003." A citation of the app's own data
is checkable; a confident sentence is not.

**Researched facts are a third kind of thing.** The app already distinguishes
*inferred* — who you probably saw, worked out from dates — from *recorded* —
who you have said you saw. Something a model read on the web is neither: call
it **sourced**, store where it came from, and show it as such.

That is not decoration. A wrong run date from one lookup would otherwise become
the basis of "who you probably saw" for every member, forever, and look exactly
like a fact somebody checked. Sourced data can be reasoned from, is visibly
unconfirmed, and can be corrected by anybody who was actually in the room —
machinery that already exists.

Requiring an administrator to approve every cast lookup would be the safe
answer and an unusable one; provenance is what buys the convenience honestly.

## An API key is a new way in

Whatever shape this takes, a key that lets an external client act as a member is
a second authentication path, and the app currently has exactly one. It would
have to resolve to a user through `currentSession` like everything else, so that
every visibility rule downstream applies unchanged — and it should be scoped:
read the catalog, read *my* data, propose but not publish. A key that can do
everything a session can do is a session with no expiry and no sign-in.

## Where I would start

Getting facts in comes first, because nothing downstream works without them.

1. ~~**Provenance and the sourced state.**~~ **Done.** `castings.source` and
   `productions.source` are one of `member`, `import`, or `research`, with an
   optional citation. The eleven castings that already existed are marked
   `import`, which is honestly how they arrived — a distinction that was still
   recoverable at eleven rows and would have been a guess at a few hundred.
2. **A research-to-import path**, using the format that already exists. An
   external model with the web produces a `catalog-import` payload; the import
   screen already checks it, warns about near-duplicate venues, and refuses to
   overwrite. This is the whole of the web half, and it needs no key and no
   server — it is a paste, today.
3. **`whenWasTheyIn`** — the inverse cast query. Useless before step 2 and
   genuinely useful after it, including from the log form with no model at all.
4. **A tool layer** over those, taking an explicit actor, testable without a
   model in the loop.
5. **The local text box**, LM Studio, decompose-and-propose.
6. **MCP**, only if the paste in step 2 has proved too slow in practice. It may
   not: a paste needs no key, no server, and no new way into the app.

The order is deliberate. Steps 1 and 2 are useful on their own and involve no
model inside the app at all. The step that adds an authentication path is last,
and might never be needed.

## Open questions

- **Does the web actually know?** Broadway run dates are well documented; who
  was on for a given Tuesday in a regional house is not. The honest answer for
  most local theatre may be that only the people who were there can say — which
  is what the correction flow is for.
- Does gpt-oss-120b call tools reliably enough, or is a single structured
  response — "here are the candidates, pick one" — the more honest shape for a
  local model?
- Should the text box exist at all, or should this live entirely in the log
  form as *narrow this down for me*? A box invites conversation; a button
  invites one useful thing.
- Is anybody but you going to type into it? If not, MCP from your own editor is
  cheaper than a screen, and there is no key to look after.
