# Catalog import format

Paste JSON in this shape at **`/admin/import`** to add shows, productions, and venues in
one go. Administrators only.

This file is written to be handed to a language model verbatim: *"Produce JSON matching
this spec for Hadestown, Suffs, and Cabaret."*

## Rules the importer enforces

- **Nothing is overwritten.** A show whose slug already exists is reported as `skipped`;
  correct it at `/admin/shows` instead. The import is safe to run twice.
- **Shows arrive published.** These are curated additions by an administrator, not member
  submissions, so they bypass the review queue.
- **Venues deduplicate themselves.** `Walter Kerr Theatre` in `NYC` and `the walter kerr`
  in `New York City` resolve to the same venue, so do not worry about matching existing
  spellings exactly.
- **Slugs are generated** from the title when omitted, with a numeric suffix on collision.
- **Every item is validated before anything is written.** A malformed entry fails the
  whole import with a message naming the item, rather than half-importing.

## Shape

```json
{
  "shows": [
    {
      "title": "Hadestown",
      "type": "musical",
      "synopsis": "Anaïs Mitchell's folk opera retelling of Orpheus and Eurydice.",
      "slug": "hadestown",
      "productions": [
        {
          "name": "Original Broadway",
          "productionType": "broadway",
          "venue": "Walter Kerr Theatre",
          "city": "New York",
          "country": "USA",
          "openedOn": "2019-04-17",
          "closedOn": null,
          "cast": [
            {
              "name": "Reeve Carney",
              "role": "Orpheus",
              "kind": "performer",
              "isPrincipal": true,
              "startedOn": "2019-04-17",
              "endedOn": null
            },
            {
              "name": "Rachel Chavkin",
              "role": "Director",
              "kind": "creative"
            }
          ]
        }
      ]
    }
  ],
  "venues": [
    { "name": "Kit Kat Club", "city": "New York", "country": "USA" }
  ]
}
```

Both top-level keys are optional; send only what you have.

## Shapes it also accepts

The wrapper is a convenience, not a requirement. All of these work:

```json
[ { "title": "Company", "type": "musical" }, { "title": "Follies", "type": "musical" } ]
```

```json
{ "title": "Company", "type": "musical" }
```

```json
[ { "name": "Booth Theatre", "city": "New York" }, { "name": "Music Box Theatre", "city": "New York" } ]
```

A bare array is read as shows, unless every entry has a `name` and no `title`, in which
case it is read as venues — which is how you seed a list of theatres. A single object is
read as one show, or one venue if it has no `title`.

A document with no shows and no venues in it is refused rather than quietly importing
nothing.

`docs/seed/broadway-theatres.json` is a ready-made venue list you can paste as-is.

## Venue warnings

Checking a paste reports venues that do not match an existing record but resemble one,
because a near-miss silently creates a second venue for the same theatre. Each warning
offers to rewrite the paste to use the existing wording.

| Warning | Meaning |
|---|---|
| No city given | The name matches but the city is missing, so it would become a separate venue. The commonest cause of duplicates |
| Same name, different city | Genuinely ambiguous — plenty of cities have an Orpheum — so it is raised for you to judge |
| Close to an existing name | A typo or a dropped word, e.g. `Al Hirschfield` against `Al Hirschfeld` |

What is folded automatically, and needs no warning: a leading `The`, `Theater` against
`Theatre`, apostrophes (`O'Neill` and `ONeill`), punctuation, accents, and city aliases
such as `NYC`, `Manhattan`, and `New York City`.

**Include the city for every venue.** It is the single thing that most reduces duplicates.

## Fields

### Show

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 1–200 characters |
| `type` | yes | `musical`, `play`, or `other` |
| `synopsis` | no | Up to 5000 characters |
| `slug` | no | Lowercase letters, numbers, hyphens. Generated from the title if omitted |
| `productions` | no | Array of productions, see below |

### Production

| Field | Required | Notes |
|---|---|---|
| `name` | yes | e.g. `Original Broadway`, `First National Tour` |
| `productionType` | yes | `broadway`, `off_broadway`, `tour`, `regional`, `local`, `other` |
| `venue` | no | Free text; resolved to a shared venue record |
| `city` | no | Free text; `NYC` and `New York City` fold together |
| `country` | no | |
| `openedOn` | no | `YYYY-MM-DD` or `null` |
| `closedOn` | no | `YYYY-MM-DD` or `null`, `null` meaning still running |

### Cast

Attached to a production, because who was in it depends on the staging.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | As written; `Kelli O'Hara` and `Kelli OHara` match, `Alex` and `Alexander` do not |
| `role` | yes | The part, or the job: `Orpheus`, `Director`, `Book and lyrics` |
| `kind` | no | `performer` (default) or `creative` |
| `isPrincipal` | no | Listed first. Defaults to true for performers |
| `startedOn` | no | `YYYY-MM-DD`, when they took the role |
| `endedOn` | no | `YYYY-MM-DD`, or `null` meaning still in it |

**The dates are what make this useful.** With them, a performance on a given night can say who
was probably on stage; without them, a person is simply listed as having been in the production.
Supply them when you know them and omit them when you do not — a wrong window produces a
confident, wrong answer on somebody's memory.

Person matching is deliberately stricter than venue matching: only case, accents, and
punctuation fold. A misspelled name therefore creates a second person rather than being absorbed
into the first, which is why checking a paste reports names that resemble somebody already
recorded.

### Venue

Only needed for a venue with no production attached — a theatre you want in the
autocomplete before anyone has logged a show there.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | |
| `city` | no | |
| `country` | no | |

## Prompt for researching a show that is not here yet

For handing to a model that can search the web. The unusual ask is the last
one: almost every cast list online is the opening-night company, and what this
app needs is **who was in the role and when**, because that is what decides
whether somebody saw Nathan Lane or Tony Danza.

> You have web access. Produce JSON in the format below for the following show,
> researching it first.
>
> Include the original Broadway production with its theatre, city, opening date,
> and closing date. For the principal roles, include **every performer who held
> the role and the dates they held it** — not only the opening-night cast.
> Replacements and limited engagements are the point of this exercise. Include
> the director and other principal creatives with `kind: "creative"`.
>
> Add a `"source"` field to each production naming the URL you took the run and
> cast dates from.
>
> **Omit any field you are not confident of rather than guessing.** Casting
> dates are used to work out who somebody saw on a particular night, so a made-up
> date does not produce a small error, it produces a false memory. A missing
> field is fine; a plausible invented one is not. If you cannot find replacement
> dates, say so in your reply and leave the cast to the opening company.
>
> Show: The Producers (Broadway)
>
> [paste the Shape section below]

Paste the result at `/admin/import`. It checks everything before writing, warns
about venues that resemble one already in the catalog, and never overwrites, so
a bad answer costs nothing but a second look.

Anything imported is recorded with `source: 'import'` rather than as something a
member vouched for — see the provenance note in `docs/an-llm-layer.md`.

## Prompt to generate it

> Using the format in `docs/catalog-import.md`, produce JSON for the following shows.
> Include the original Broadway production with venue, city, and opening date where you
> are confident of them, and the principal cast and creative team with the dates they held
> each role. Omit any field you are unsure about rather than guessing — especially casting
> dates, which are used to work out who somebody saw on a particular night.
> Shows: …

The last sentence matters. An invented venue or opening date is worse than a blank field
in an archive people are trusting with their own history — and everything here is
editable afterwards at `/admin/shows`.
