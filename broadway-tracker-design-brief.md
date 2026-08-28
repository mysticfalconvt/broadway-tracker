# Broadway Tracker — Product & Visual Design Brief

## Product vision

**Broadway Tracker** is a personal theatre journal and shared archive for people who love Broadway, touring, regional, and local theatre.

The core idea is:

> **A modern theatre journal for collecting your own theatre history and preserving the nights you shared with people you care about.**

The product should feel polished enough to grow beyond a private family-and-friends app, while staying intimate, warm, and non-performative.

The guiding design principle is:

> **Modern in operation, theatrical in emotion.**

Everyday tasks should feel crisp and contemporary. Memories, favorites, and meaningful shared experiences can feel richer, more tactile, and more atmospheric.

---

# 1. Core product principles

## Personal by ownership, communal by discovery

Users own their personal theatre history, opinions, ratings, notes, lists, and privacy settings.

Friends and family add context through:

- shared performances
- recommendations
- overlapping Want to See lists
- shared memories
- friend reviews
- trusted-circle logging
- low-key activity

The app should never feel like a follower-driven social network.

Avoid:

- follower counts
- popularity rankings
- engagement bait
- streaks
- public-facing social pressure
- infinite activity feeds as the main experience

---

## Shared memories are a core concept

The product should model theatre at three levels:

### Show

Example:

**Hadestown**

This is the underlying theatrical work.

### Production

Example:

**Hadestown — Broadway at Walter Kerr Theatre**

A production can represent:

- Broadway
- West End
- national tour
- regional production
- local production
- school/community production

### Performance / outing

Example:

**Hadestown — May 18, 2026 — Walter Kerr Theatre**

This is the actual night someone attended.

A shared outing can contain:

- date and time
- production
- venue
- city
- attendees
- shared photos
- shared contextual details

Each attendee still owns their own:

- rating
- favorite status
- shareable review
- private notes
- privacy settings

This distinction between **shared facts** and **personal opinions/memories** should remain very clear throughout the UX.

---

# 2. Visual direction

The final visual direction blends three concepts.

## 2.1 Modern Theatre Journal

The everyday application shell should feel:

- contemporary
- editorial
- spacious
- warm
- clear
- refined

Use:

- warm ivory backgrounds
- clean sans-serif interface type
- editorial serif headings
- fine rules and borders
- restrained cards
- generous spacing
- minimal decorative chrome

This direction should dominate:

- navigation
- forms
- search
- filters
- library management
- admin
- settings
- discover

Think:

**Museum archive × personal journal × excellent modern web app**

---

## 2.2 Collected Nights

Things that represent memories should have more physical presence.

Examples:

- logged performances
- shared outings
- favorites
- historical memories
- curated lists

Possible details:

- subtle paper surfaces
- fine borders
- small archival date labels
- layered spacing
- delicate rules
- slightly richer typography
- occasional brass details
- restrained reveal animations

Avoid literal ticket-stub UI.

The goal is to suggest:

> **This is something I kept.**

---

## 2.3 After the House Lights

Certain emotionally important experiences may use immersive dark surfaces.

Good candidates:

- landing-page hero
- show detail hero
- shared memory detail
- favorites
- special profile moments
- selected history milestones

Use:

- midnight
- oxblood
- warm cream type
- restrained brass details

Dark UI should be **episodic**, not the default application theme.

This avoids the generic streaming-service look.

---

## Recommended balance

Use approximately:

- **55% Modern Theatre Journal**
- **30% Collected Nights**
- **15% After the House Lights**

A practical rule:

> **Everyday tasks are quiet. Memories get character. Important moments get atmosphere.**

---

# 3. Color system

Use semantic tokens instead of scattering literal Tailwind colors through components.

## Core palette

| Role | Suggested starting value | Usage |
|---|---:|---|
| Paper | `#F7F3EA` | Main application background |
| Paper Raised | `#FFFDF8` | Panels, forms, collected objects |
| Paper Muted | `#EEE8DC` | Subdued sections |
| Ink | `#201E1D` | Primary text |
| Ink Muted | `#6E6862` | Secondary text / metadata |
| Hairline | `#D8D0C3` | Borders / dividers |
| Midnight | `#17202B` | Navigation / immersive sections |
| Midnight Soft | `#25303B` | Raised dark surfaces |
| Oxblood | `#7A2633` | Emotional accent / favorites |
| Oxblood Deep | `#591B26` | Dark states / hover |
| Brass | `#A4814F` | Rare decorative highlights |
| Success | `#39735C` | Confirmed states |
| Warning | `#9A6827` | Pending / validation |
| Danger | `#A13B3B` | Destructive / errors |

## Semantic behavior

### Midnight

Use for:

- primary buttons
- structure
- navigation
- dark hero areas

### Oxblood

Use for:

- Favorite
- emotional actions
- selected memorable states
- special theatrical emphasis

### Brass

Use sparingly.

Do **not** use brass as the default button color.

Brass should feel like detail, not chrome.

Example:

- `Save changes` → Midnight
- `Add to Favorites` → Oxblood
- thin decorative rule → Brass

---

# 4. Typography

Use two primary font families.

## Editorial serif

Recommended territory:

- Newsreader
- Source Serif 4
- Libre Baskerville
- DM Serif Display for limited display use

Preferred starting options:

**Newsreader** or **Source Serif 4**

Use serif for:

- show titles
- major page headings
- quotes
- reviews
- important years
- marketing copy
- emotional empty states
- special memory moments

---

## Interface sans

Recommended:

- Inter
- Geist
- another highly legible modern sans

Use sans for:

- navigation
- controls
- forms
- metadata
- ratings
- filters
- chips
- admin
- lists
- status indicators

---

## Suggested hierarchy

| Token | Size |
|---|---|
| `display-xl` | 56–72px serif |
| `display` | 40–52px serif |
| `h1` | 34–40px serif |
| `h2` | 26–30px serif |
| `h3` | 20–22px serif or sans |
| `body-lg` | 18px |
| `body` | 16px |
| `small` | 14px |
| `meta` | 12–13px |

Avoid serif-heavy body copy.

Avoid large blocks of all caps.

---

# 5. Spacing and layout

Use a 4px base spacing scale.

Recommended emphasis:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64
- 96

The product should feel spacious rather than dense.

## Desktop content widths

- primary application content: `max-width: 1440px`
- editorial / reading content: `720–900px`
- forms: `560–720px`

Desktop page gutters:

- approximately `32–48px`

---

## Radius

Avoid overly bubbly SaaS styling.

Suggested:

- controls: `8px`
- standard cards: `10–12px`
- dialogs: `16px`
- pills: fully rounded only when appropriate

Avoid applying `rounded-2xl` everywhere.

---

# 6. Navigation structure

Primary navigation:

- Home
- My Theatre
- Discover
- Friends

Persistent primary action:

- **+ Log**

Profile and settings live separately.

---

## My Theatre

Inside **My Theatre**:

- Library
- History
- Lists
- Stats

This is the emotional and functional center of the product.

### Library

Answers:

> What shows are in my collection?

### History

Answers:

> What did I see, when, where, and with whom?

### Lists

User-created shelves and collections.

### Stats

Optional deeper analysis for interested users.

---

# 7. Home

Home should feel like a curated theatre dashboard, not a feed.

## Suggested structure

### Greeting

Example:

**Good evening, Robert**

*Your theatre, remembered.*

Primary action:

**+ Log a performance**

Secondary action:

**Build your history**

---

## Your Theatre

Compact snapshot:

**57 performances · 42 shows · 12 favorites**

Then:

- recent logs
- recently updated memories
- quick shortcuts

---

## From Your Circle

Show only a small number of meaningful friend updates.

Examples:

> Sarah saw *Suffs*  
> ★★★★½  
> “Loved the score more than I expected.”

> Mom added *Gypsy* to Want to See.

> You and Alex both want to see *Operation Mincemeat*.

Avoid infinite scrolling.

---

## Want to See

Use:

- compact grid
- horizontal collection
- editorial list

---

## Shared Memories

Highlight one or two shared theatre nights.

This section can use the richer **Collected Nights** treatment.

---

# 8. Show card system

Do not create one universal show card.

Create multiple specialized variants.

---

## 8.1 Compact Show Row

Use for:

- search
- admin
- dense lists
- quick pickers

Suggested structure:

`thumbnail | title + type | metadata | status`

Must look intentional without art.

---

## 8.2 Library Show Card

Suggested content:

**Hadestown**  
Musical

★★★★★  
Seen 4 times

`Favorite` `Seen`

Latest: May 18, 2026

Artwork should enhance the card, not define it.

---

## 8.3 Artwork fallback

Never show a generic gray image placeholder.

Fallback options can use:

- tonal midnight block
- oxblood block
- warm paper block
- large serif show title
- tiny type label
- abstract collection mark

`ShowArtwork` should own this behavior centrally.

---

## 8.4 Memory Card

Represents one actual performance.

Suggested structure:

**MAY 18 · 2026**

# Hadestown

Walter Kerr Theatre  
New York, NY

**You · Sarah · Mom · Alex**

★★★★★

Optional review excerpt.

If photos exist, integrate them naturally.

If no photos exist, typography should expand into the space gracefully.

---

# 9. Status system

The three primary show relationships are:

- Want to See
- Seen
- Favorite

Favorite is not mutually exclusive with Seen.

---

## Want to See

Use:

- bookmark-like icon
- text label

---

## Seen

Use:

- check icon
- text label

---

## Favorite

Use:

- oxblood accent
- emotional icon or collection mark
- text label

Favorite should feel more meaningful than a standard filter state.

Never rely on color alone.

---

# 10. Ratings

Use:

- 0.5–5 stars
- half-star increments
- rating is optional

Suggested data range:

`0.5` through `5.0`

---

## Display

Examples:

- ★★★★★
- ★★★★½

For accessibility:

> 4.5 out of 5 stars

---

## Input

Desktop may support half-star hover zones.

Mobile needs extra care.

Possible approaches:

- half-star hit zones
- drag interaction
- explicit numeric selection
- star row plus value picker

Do not make half-stars difficult to select on touchscreens.

---

# 11. Privacy indicators

Default privacy:

**Private**

Supported levels:

- Only me
- Friends
- Public later

Recommended visual treatment:

- lock + **Only me**
- people + **Friends**
- globe + **Public**

Do not use colored dots as the only state indicator.

Privacy should be visible but quiet.

Example:

**Visible to: Only me**

---

# 12. Library UX

The Library should feel like a personal collection, not a database.

## Header

**My Theatre**

`42 shows · 57 performances`

Primary tabs:

- Library
- History
- Lists
- Stats

Inside Library:

- All
- Want to See
- Seen
- Favorites

---

## Filters

Recommended:

- Search your theatre
- Type
- Genre
- Year seen
- City
- More

Use a compact filter bar instead of a permanent dense sidebar.

---

## View modes

Support:

- Grid
- List

Grid provides the collectible feeling.

List supports power users, sparse artwork, and larger libraries.

Remember user preference.

---

## Sorting

Useful options:

- Recently logged
- Show title
- Most recently seen
- First seen
- Rating
- Most seen

---

# 13. History UX

History should be chronological and editorial.

Avoid a giant table.

Example:

## 2026

**May 18**  
Hadestown  
Walter Kerr Theatre · with Sarah, Mom & Alex

**March 6**  
Suffs  
Music Box Theatre

---

## 2025

...

Years with no performances should simply not appear.

---

## Optional views

Primary:

**Timeline**

Possible secondary:

**Calendar**

Timeline should remain the default.

---

# 14. Fuzzy date support

This is a core product requirement because users may backfill decades of history.

Do not force every performance into an exact date.

Support:

### Exact

`May 18, 2026`

### Month

`May 2026`

### Year

`2007`

### Approximate

`Around 2005`

### Unknown

`Date unknown`

Do not invent placeholder dates such as January 1.

This should be modeled explicitly in the database and UI.

---

# 15. Build Your Theatre History

Backfilling is a first-class experience.

It should not use the same workflow as logging last night’s show.

The goal:

> **Add historical shows extremely quickly, then enrich them later.**

---

## Main flow

# Build Your Theatre History

*Add everything you remember. Details can come later.*

Keep search persistently focused.

Example search:

`les mis`

Result:

**Les Misérables**

`+ Seen`

After selection:

## When did you see it?

Options:

- Exact date
- Month / year
- Year
- Approximate
- I don't remember

Then optionally ask:

- production
- venue
- city

Provide a prominent:

**Skip for now**

Return focus immediately to search.

---

## Performance goal

A user should be able to add a historical show in roughly:

**5–10 seconds**

---

## Added Today queue

Useful side panel or bottom section:

**Added today**

- Wicked — 2008
- Rent — date unknown
- The Lion King — 2004
- Next to Normal — 2010

This makes backfilling feel satisfying and progressive.

---

# 16. Show detail page

This is a strong place to introduce selective dark theatrical styling.

## Hero

Use:

- Midnight
- rich tonal surface
- optional show artwork
- strong serif title

Example:

# Hadestown

Musical · Anaïs Mitchell

`Favorite`

Your relationship:

**Seen 4 times**

★★★★★

Actions:

- Log performance
- Edit my show details

---

## Page sections

Keep information layered.

Recommended:

- About the show
- Your history
- Productions
- From your friends
- Catalog information

Do not merge generic catalog data and personal history into a single blob.

---

# 17. Shared Memory / Performance page

This may become the product's most distinctive screen.

Suggested structure:

**MAY 18, 2026**

# Hadestown

Walter Kerr Theatre  
New York

Attendees:

`RB` `SM` `AB` `+1`

**You · Sarah · Mom · Alex**

---

## Photos

A shared outing may contain several photos.

Examples:

- group photo
- marquee
- program
- dinner
- venue exterior

If photos exist:

- 1 photo → editorial hero
- 2–4 photos → restrained collage
- 5+ photos → curated preview + View photos

If no photos exist:

- no gray placeholder
- title and metadata expand naturally
- typography carries the emotional weight

Rule:

> **Photos enhance a memory; they never define its layout.**

---

## Shared reactions

Each attendee can contribute their own rating and review.

Example:

**Robert**  
★★★★★  
“One of those perfect nights.”

**Sarah**  
★★★★½  
“I can’t stop thinking about the staging.”

---

## Private notes

Personal notes must remain visually distinct.

Example:

🔒 **Only you**

> First show we took the kids to...

Private content should never appear visually mixed into the shared content.

---

# 18. Quick Log flow

Logging a recent performance should be extremely fast.

Responsive pattern:

- modal on desktop
- sheet / full-screen flow on mobile

---

## Step 1 — What did you see?

Search the shared show catalog.

If not found:

**+ Add a new show**

---

## Step 2 — When and where?

Default date:

**Today**

Fields:

- production
- venue
- city
- date/time

Secondary details can live behind:

**Add details**

---

## Step 3 — Who were you with?

Use:

- friend avatars
- friend search
- recent companions

Trusted users should be visually marked.

Example:

**Sarah ✓ auto-adds shared outings**

---

## Step 4 — What did you think?

- star rating
- Favorite toggle
- shareable review
- private notes
- photos

All optional except the minimum required to create the log.

---

## Save action

**Log performance**

Avoid an exhausting multi-step wizard.

Desktop can show a structured single form.

Mobile can progressively reveal sections.

---

# 19. Trusted-circle sharing

Trusted sharing is a major product differentiator.

Default behavior:

A friend must approve being added to a shared performance.

Trusted-circle behavior:

A user may allow selected friends/family to automatically add shared performances to their history.

---

## Trusted example

> Robert logged Hadestown with you.

Added automatically to your theatre history.

Actions:

- Add rating
- View memory

---

## Non-trusted example

> Robert says you saw Hadestown together.

Actions:

- Add to my history
- Not me

---

## Ownership model

Shared fields:

- show
- production
- venue
- city
- date/time
- shared photos
- attendee list

Personal fields:

- rating
- Favorite
- private notes
- shareable review
- personal privacy

---

# 20. Friends

Do not use a follower model.

Recommended structure:

- Requests
- Friends
- Activity

---

## Friend row

Show:

- avatar
- name
- subtle shared context

Possible example:

**12 shared performances**

Avoid vanity metrics.

---

## Activity

Example:

**Sarah saw Cabaret**  
August 12 · Kit Kat Club  
★★★★½  
“Adam Lambert was incredible.”

Avoid:

- likes
- comment counts
- follower counts
- trending metrics

A private reply feature could exist later, but is not required for the first version.

---

# 21. Lists

Lists should feel editorial.

Example:

# Shows to see with the family

*6 shows*

**Operation Mincemeat**  
Want to See · also on Sarah's list

**The Outsiders**  
Want to See

Lists can support:

- private
- friends
- public later

Collaborative lists may be a future enhancement.

List covers should work beautifully without uploaded artwork.

Typographic covers are encouraged.

---

# 22. Profile

A profile should answer:

> **Who is this person in the context of theatre?**

Not:

> **How popular is this person?**

Suggested header:

# Robert

*42 shows · 57 performances · 12 favorites*

Optional bio.

Sections:

- Favorite shows
- Recent memories
- Shared lists
- Theatre history snapshot
- Shared with this friend

A useful friend-context block:

**Shared with Robert**

`18 performances together`

---

# 23. Stats

Stats should be deep but non-prominent.

Basic profile summary can remain subtle:

**42 shows · 57 performances · 12 favorites**

A dedicated Stats area can support power users.

Possible views:

- Shows seen
- Total performances
- Repeat shows
- Musicals vs plays
- Favorite venues
- Cities
- Rating distribution
- Performances by year
- Theatre companions
- Most-seen shows
- Longest gaps
- First logged performance

Do not expose stats as competitive friend metrics.

Charts should work gracefully with sparse years.

---

# 24. Discover

Discover should begin as:

> **Search-led, socially enriched**

Search remains the primary feature.

# Discover

**Search shows, productions, venues…**

Then add social context.

Suggested sections:

- Friends recommend
- On your friends' Want to See lists
- Recently added to the catalog
- Shows your circle has seen

Search result example:

**Hamilton**  
Musical  
Seen by Sarah + 3 friends

Avoid fake recommendation scores.

Friend recommendations should feel more authentic than algorithmic personalization.

---

# 25. Admin / catalog validation

Admin can be denser and more functional than the consumer-facing app.

Recommended functions:

- pending submissions
- possible duplicates
- production matching
- show editing
- merge review

Actions:

- Approve
- Merge
- Edit
- Reject

Example duplicate review:

### Submitted

Hadestown  
Hadestown Broadway  
Walter Kerr

### Possible existing show

Hadestown  
Anaïs Mitchell  
Musical

**Merge into Hadestown**

---

# 26. Mobile behavior

Mobile should be intentionally designed, not just compressed desktop.

---

## Navigation

Recommended bottom navigation:

- Home
- My Theatre
- + Log
- Discover
- Friends

Profile/settings can live behind the avatar or header menu.

---

## Library

Grid:

- 2 columns when artwork is present

List:

- single column

Filters:

- bottom sheet

---

## Show detail

Stack hero vertically.

Keep:

- Favorite
- Seen state
- Log performance

near the top.

Do not force users through catalog metadata before reaching personal actions.

---

## History

A vertical timeline naturally works well on mobile.

---

## Shared memory

Photos become swipeable.

Reviews stack vertically.

---

## Forms

Use:

- full-screen sheet
- bottom sheet
- progressive sections

Avoid narrow desktop modals on mobile.

---

# 27. Motion

Use motion only where it adds meaning.

Good candidates:

## Favorite

Small `180–250ms` emphasis.

## Performance saved

The new memory settles into place or receives a subtle collected animation.

## Shared memory opening

Gentle reveal:

- title
- date
- attendees
- content

## Photo gallery

Soft crossfade or slide.

## Library filtering

Subtle layout transition.

---

Avoid:

- parallax
- constant marquee animation
- bouncing CTAs
- heavy route transitions
- decorative loading theatrics

Support:

```css
@media (prefers-reduced-motion: reduce) {
  /* disable non-essential animation */
}
```

---

# 28. Accessibility

Accessibility should be part of the system from the beginning.

---

## Contrast

All normal text should meet WCAG AA.

Do not use Brass for small text on Paper unless verified for contrast.

---

## Body type

Minimum normal body size:

**16px**

---

## Keyboard support

All major interactions should work without a pointer:

- ratings
- tabs
- show cards
- autocomplete
- filters
- dialogs
- photo viewer
- friend picker

---

## Focus states

Use strong visible focus states.

Recommended:

- Midnight ring on light surfaces
- warm cream / brass-adjacent high-contrast ring on dark surfaces

---

## Non-color-only status

Never rely on:

`green dot = approved`

Use:

`✓ Approved`

Likewise:

`🔒 Only me`

---

## Ratings

Expose semantic labels such as:

**4.5 out of 5 stars**

---

## Photos

User-uploaded photos should support accessible descriptions where possible.

At minimum, do not create inaccessible image-only controls.

---

# 29. React / Tailwind design system

Use semantic design tokens.

Example conceptual config:

```ts
colors: {
  canvas: "...",
  surface: "...",
  "surface-muted": "...",

  ink: "...",
  "ink-muted": "...",

  border: "...",

  midnight: "...",
  oxblood: "...",
  brass: "...",

  success: "...",
  warning: "...",
  danger: "..."
}
```

Avoid using raw color utilities throughout the component layer.

---

## Button variants

Use semantic variants:

```tsx
<Button variant="primary" />
<Button variant="secondary" />
<Button variant="quiet" />
<Button variant="emotional" />
<Button variant="danger" />
```

Suggested behavior:

- `primary` → Midnight
- `emotional` → Oxblood
- `danger` → destructive red
- `quiet` → text / low-emphasis action

---

## Component primitives

Examples:

```tsx
<PrivacyBadge visibility="private" />
<ShowStatus status="seen" />
<ShowStatus status="want" />
<FavoriteToggle />
<Rating value={4.5} />
```

Semantic components should own their visual and accessible behavior.

---

# 30. Initial component inventory

Recommended early component layer:

- `AppShell`
- `PageHeader`
- `SectionHeader`
- `EditorialHeading`
- `Button`
- `IconButton`
- `Tabs`
- `Chip`
- `FilterChip`
- `Avatar`
- `AvatarGroup`
- `ShowArtwork`
- `ShowCard`
- `ShowRow`
- `PerformanceCard`
- `MemoryCard`
- `Rating`
- `FavoriteToggle`
- `ShowStatus`
- `PrivacyBadge`
- `ActivityItem`
- `EmptyState`
- `SearchCombobox`
- `DatePrecisionInput`
- `FriendPicker`
- `PhotoStrip`
- `ReviewBlock`
- `PrivateNote`
- `Modal`
- `Drawer`
- `MobileSheet`

---

## Important implementation rule

`ShowArtwork` should centrally own all artwork fallback behavior.

Every other component should assume:

> **Artwork may be missing.**

This prevents the UI from becoming dependent on high-resolution marketing assets.

---

# 31. Brand direction

Brand style:

**Collection mark + editorial wordmark**

The mark should abstractly suggest ideas such as:

- saved program
- overlapping pages
- bookmark
- archive card
- ticket
- collected memories

Do not literally illustrate a ticket.

Avoid:

- comedy/tragedy masks
- musical notes
- stage curtains
- marquee light bulbs
- spotlights
- Broadway clichés

---

## Wordmark

**Broadway Tracker**

Use the editorial serif.

Potential marketing line:

> **Your theatre, remembered.**

The mark must work at:

- favicon size
- mobile icon size
- navigation size
- landing-page size

---

# 32. The key experience to design around

A useful north-star screen:

---

**MAY 18, 2026**

# Hadestown

Walter Kerr Theatre  
New York, NY

`[group photo] [marquee photo] [program photo]`

**You · Sarah · Mom · Alex**

---

### Robert

★★★★★

> One of those perfect nights.

### Sarah

★★★★½

> I can’t stop thinking about the staging.

---

🔒 **Your private note**

> First show we took the kids to in NYC...

---

If this page feels special **with photos and without photos**, the visual direction is working.

---

# 33. Final recommended design direction

Internal design direction name:

# **Collected Nights**

Core rules:

1. **Modern product shell**
2. **Editorial typography**
3. **Warm paper surfaces**
4. **Midnight for structure**
5. **Oxblood for emotion**
6. **Brass only as detail**
7. **Collected memories get physical presence**
8. **Photos are enhancement, never dependency**
9. **Social interactions represent people and shared experiences**
10. **Never use popularity mechanics as the product's emotional center**

---

# 34. Final product hierarchy

## Home

Curated personal + trusted-circle dashboard.

## My Theatre

- Library
- History
- Lists
- Stats

## Discover

Catalog search + friend context.

## Friends

Trusted circle + low-key activity.

## Log

Fast creation of:

- performances
- shared memories

## Build History

Dedicated rapid-entry workflow for reconstructing years or decades of theatre history.

---

# 35. Suggested implementation order

Build the design system in roughly this order:

1. Color tokens
2. Typography
3. Spacing and layout primitives
4. `AppShell`
5. Buttons and interactive states
6. Tabs / chips / filters
7. `ShowArtwork`
8. `ShowCard`
9. `ShowRow`
10. `Rating`
11. `ShowStatus`
12. `FavoriteToggle`
13. `PrivacyBadge`
14. `MemoryCard`
15. `PerformanceCard`
16. `AvatarGroup`
17. `SearchCombobox`
18. `DatePrecisionInput`
19. `FriendPicker`
20. `PhotoStrip`
21. `PrivateNote`
22. Modal / Drawer / MobileSheet
23. Home
24. My Theatre
25. Show Detail
26. Quick Log
27. Shared Memory
28. Friends
29. Discover
30. Admin

This sequence should allow the visual language to stabilize before many screens are implemented.

---

# 36. Short design-system summary

If a developer needs the shortest possible version:

> **Broadway Tracker uses a warm editorial light interface with clean modern controls and selective dark theatrical moments. Everyday UI should be quiet and highly usable. Shows and memories should feel collected rather than card-heavy. Midnight carries structure, oxblood carries emotion, brass is rare detail. Serif typography communicates identity and memory; sans-serif typography handles interaction. Artwork and photos are optional enhancements, never structural dependencies. Shared theatre experiences are central, while follower-style social mechanics are intentionally absent.**
