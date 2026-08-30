# Asking the app in words

Ideas, not a plan. Nothing here is built.

The prompt that started this:

> *I went to see The Producers around 2003ish. Tony Danza was in it. Can you
> narrow down when that was and log it for me.*

## The example is mostly a query

`likelyCastOn(production, date)` already answers "who was on stage that night".
The sentence above needs the same table read backwards — *given this person in
this production, what dates could it have been* — and that is a `select`, not a
reasoning problem:

```
show:    The Producers
person:  Tony Danza
→ castings.startedOn … castings.endedOn for that pairing
→ a window, or several if he came and went
```

Two consequences worth sitting with before choosing any model:

**A useful chunk of this needs no LLM at all.** A "narrow this down" endpoint
taking a show, an optional person, and a rough year, returning candidate
windows, would answer the example. It is a day's work, it cannot hallucinate,
and it is worth building whether or not anything else here happens.

**The app should sometimes disagree with the sentence.** If the castings say
Danza played Bialystock in the winter of 2006, then "around 2003" is not vague,
it is *wrong*, and the honest answer is to say so rather than quietly picking a
date in the middle. That is the same instinct as fuzzy dates: never invent
precision somebody did not have.

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

## The decision that actually matters: what leaves the house

This is a private journal for one family. The interesting split is not local
versus hosted for cost or quality — it is that **a hosted model means somebody's
theatre history, and their friends' names, leave the building.**

That suggests a hard line rather than a preference:

- **Anything touching member data — local only.** The LM Studio box, no
  exceptions, no fallback to a cloud model when it is slow. Logging a night,
  reading a shelf, drafting an outing.
- **Anything about public facts — anywhere, web research included.** When did
  the tour play Boston, who was in the 2003 company, what is the Nederlander's
  address. None of that is anybody's private business.

The pleasant part is that this maps exactly onto the two front doors:

**In-app, local, no web.** Logging and recall, against the catalog we have.
Fast, private, offline-capable, and it never needs to browse because everything
it reasons about is already in Postgres.

**MCP, external, with the web.** Catalog work — filling in a show, a run, a cast
list — done from a client that can research. This is where web access genuinely
earns its keep, and where it is safe to use, because the subject matter is
public record.

`docs/catalog-import.md` was already written to be handed to a language model
verbatim. An MCP server is that same seam with the copy-and-paste removed.

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

**Nothing new in the catalog without review.** A model may propose a show, a
production, or a casting. Publishing stays a person's decision, through the
queue that already exists.

## An API key is a new way in

Whatever shape this takes, a key that lets an external client act as a member is
a second authentication path, and the app currently has exactly one. It would
have to resolve to a user through `currentSession` like everything else, so that
every visibility rule downstream applies unchanged — and it should be scoped:
read the catalog, read *my* data, propose but not publish. A key that can do
everything a session can do is a session with no expiry and no sign-in.

## Where I would start

1. **`whenWasTheyIn`** — the inverse cast query, plus a narrow-it-down endpoint.
   No model, no key, no new dependency. It answers the original example and is
   useful on its own from the log form.
2. **A tool layer** over the functions above, taking an explicit actor, testable
   without a model in the loop.
3. **The local text box.** One screen, LM Studio, propose-and-confirm.
4. **MCP for catalog work**, if the seam still feels worth it once the first
   three exist. It may not: bulk import already handles the same job with a
   paste, and a paste needs no key and no server.

The order matters because each step is useful alone, and because the last one is
the only one that adds an authentication path.

## Open questions

- Does gpt-oss-120b call tools reliably enough, or is a single structured
  response — "here are the candidates, pick one" — the more honest shape for a
  local model?
- Should the text box exist at all, or should this live entirely in the log
  form as *narrow this down for me*? A box invites conversation; a button
  invites one useful thing.
- Is anybody but you going to type into it? If not, MCP from your own editor is
  cheaper than a screen, and there is no key to look after.
