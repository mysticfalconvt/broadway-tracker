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
          "closedOn": null
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

### Venue

Only needed for a venue with no production attached — a theatre you want in the
autocomplete before anyone has logged a show there.

| Field | Required | Notes |
|---|---|---|
| `name` | yes | |
| `city` | no | |
| `country` | no | |

## Prompt to generate it

> Using the format in `docs/catalog-import.md`, produce JSON for the following shows.
> Include the original Broadway production with venue, city, and opening date where you
> are confident of them, and omit any field you are unsure about rather than guessing.
> Shows: …

The last sentence matters. An invented venue or opening date is worse than a blank field
in an archive people are trusting with their own history — and everything here is
editable afterwards at `/admin/shows`.
