import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Better Auth's standard tables. Keep this shape aligned with the installed
// Better Auth version when configuring the auth server.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  handle: text('handle').notNull().unique(),
  profileVisibility: text('profile_visibility', {
    enum: ['private', 'friends', 'public'],
  })
    .notNull()
    .default('public'),
  /**
   * How often to write to somebody who has stopped visiting.
   *
   * Weekly by default. The thin-letter risk is real at this size — the whole
   * app produces under two nights a week — but it is carried by the rule that
   * an empty letter is never sent at all: a week with nothing in it produces
   * silence rather than a paragraph of nothing, and the clock is not reset, so
   * the next week is considered as soon as there is something to say.
   */
  digestCadence: text('digest_cadence', { enum: ['off', 'weekly', 'monthly'] })
    .notNull()
    .default('weekly'),
  /**
   * When they last looked at anything. Sessions record signing in, which is not
   * the same. Written at most once an hour, so reading a page is not a write.
   */
  lastActiveAt: timestamp('last_active_at'),
  lastDigestAt: timestamp('last_digest_at'),
  /**
   * Lets somebody stop the letters from inside a letter.
   *
   * Unsubscribing must never require remembering a password — that is the
   * difference between stopping the mail and reporting it as spam.
   */
  digestToken: uuid('digest_token').notNull().defaultRandom(),
  role: text('role', { enum: ['member', 'admin'] })
    .notNull()
    .default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    issuer: text('issuer').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('account_issuer_account_id_unique').on(table.issuer, table.accountId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const shows = pgTable(
  'shows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    type: text('type', { enum: ['musical', 'play', 'other'] }).notNull(),
    synopsis: text('synopsis'),
    coverImageKey: text('cover_image_key'),
    /**
     * `local` is a member's own record — a community theatre's original revue,
     * a school's devised piece — that never enters the shared catalog and
     * never sits in the review queue. Every other query filters on an explicit
     * status, so a local show is invisible to them by default and each door it
     * may pass through has to be opened deliberately.
     */
    catalogStatus: text('catalog_status', {
      enum: ['pending', 'published', 'rejected', 'local'],
    })
      .notNull()
      .default('pending'),
    /**
     * What two people from the same town agree about for a work that exists
     * nowhere but there: its title, and the hall it was staged in. Only local
     * shows carry one.
     */
    localKey: text('local_key').unique(),
    submittedByUserId: text('submitted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('shows_catalog_status_idx').on(table.catalogStatus)],
)

/**
 * A theatre, as a first-class record rather than free text on every log.
 *
 * `matchKey` is the normalised name-within-city that deduplication runs on, and
 * it is unique: two people entering "Walter Kerr Theatre" and "the walter kerr"
 * land on the same row instead of creating a second one. The displayed `name`
 * and `city` keep whatever wording the first person used.
 */
export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    city: text('city'),
    country: text('country'),
    matchKey: text('match_key').notNull().unique(),
    /**
     * Where the building is, looked up once and kept.
     *
     * Null means "not known yet", which is the ordinary state of a venue nobody
     * has needed on a map. A theatre does not move, so this is filled in the
     * first time it is wanted and never asked for again — which is also what
     * the geocoder's own terms require of anyone using it.
     */
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    geocodedAt: timestamp('geocoded_at'),
    /**
     * How many times a lookup has been tried and come back with nothing.
     *
     * Some venues are simply not findable — a school hall, a name with a typo,
     * a room in somebody's house. Without this, every page view would ask the
     * geocoder about them again forever, which is exactly the hammering its
     * rate limit exists to prevent.
     */
    geocodeAttempts: smallint('geocode_attempts').notNull().default(0),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('venues_name_idx').on(table.name)],
)

/**
 * A performer or creative. Deliberately thin: a name, and a note only where one
 * is needed to tell two people apart.
 *
 * `matchKey` is the normalised name that deduplication runs on, so two members
 * typing "Alex Brightman" and "alex brightman" land on the same person. Two
 * genuinely different people who share a name collide here; that is rare enough
 * to be worth the simplicity, and an administrator can separate them.
 */
export const people = pgTable(
  'people',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    note: text('note'),
    matchKey: text('match_key').notNull().unique(),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('people_name_idx').on(table.name)],
)

/**
 * Somebody in a production, and when.
 *
 * The dates are what make this useful: casts change constantly, so who was on
 * stage depends on the night, not the production. An open `endedOn` means still
 * in the role as far as anyone has recorded.
 */
export const castings = pgTable(
  'castings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    productionId: uuid('production_id')
      .notNull()
      .references(() => productions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    // Creative roles are held for the whole run; performers come and go.
    kind: text('kind', { enum: ['performer', 'creative'] })
      .notNull()
      .default('performer'),
    isPrincipal: boolean('is_principal').notNull().default(false),
    startedOn: date('started_on'),
    endedOn: date('ended_on'),
    /**
     * Where this came from, which is not the same as who typed it.
     *
     * These dates decide what the app tells somebody they probably saw, so a
     * wrong one becomes a false memory for every member and looks exactly like
     * a fact that was checked. Three kinds, and the difference is who would
     * know if it were wrong:
     *
     *   `member`   — somebody in the room said so
     *   `import`   — pasted in from a prepared document, reviewed by a person
     *   `research` — found by a machine reading the web, confirmed by nobody
     */
    source: text('source', { enum: ['member', 'import', 'research'] })
      .notNull()
      .default('member'),
    /** Where it was found: a URL, a book, whatever would let somebody check. */
    sourceNote: text('source_note'),
    /**
     * Where this person came in the sequence of people who played the role.
     *
     * Sources very often publish the order of replacements and no dates at all
     * — "Max: Henry Goodman, Brad Oscar, … Richard Kind, Tony Danza" — and that
     * order is worth keeping. Somebody seventh of seven, in a run that ended in
     * April 2007, was late in it, which is enough to tell a person their memory
     * of 2003 is a few years out.
     *
     * An estimate made from this is never a date. It narrows a guess and says
     * that it is doing so.
     */
    replacementOrder: smallint('replacement_order'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('castings_production_idx').on(table.productionId),
    index('castings_person_idx').on(table.personId),
  ],
)

export const productions = pgTable(
  'productions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    productionType: text('production_type', {
      enum: ['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other'],
    }).notNull(),
    /**
     * Whether this staging belongs in everybody's list for the show.
     *
     * A school's production of a popular musical is a real production, but
     * putting it in the dropdown that every member sees when they log that
     * show would bury the professional stagings under hundreds of them. Local
     * stagings surface at their venue instead.
     */
    scope: text('scope', { enum: ['catalog', 'local'] })
      .notNull()
      .default('catalog'),
    /**
     * What two strangers from the same town actually agree about.
     *
     * Professional stagings deduplicate on their name, because everybody calls
     * it "the national tour". Nobody invents the same name for a school
     * production, so local ones key on the show, the venue, and the year: two
     * people who saw different nights of the same run land on one record.
     */
    localKey: text('local_key').unique(),
    venue: text('venue'),
    city: text('city'),
    country: text('country'),
    openedOn: date('opened_on'),
    closedOn: date('closed_on'),
    /** As on castings: a run's dates are only as good as where they came from. */
    source: text('source', { enum: ['member', 'import', 'research'] })
      .notNull()
      .default('member'),
    sourceNote: text('source_note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('productions_show_id_idx').on(table.showId)],
)

export const libraryEntries = pgTable(
  'library_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['want_to_see', 'seen'] }).notNull(),
    // Stored as half-star units: 1 = 0.5 stars, 10 = 5 stars. Null means unrated.
    rating: smallint('rating'),
    favorite: boolean('favorite').notNull().default(false),
    review: text('review'),
    visibility: text('visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('library_entries_user_show_unique').on(table.userId, table.showId),
    index('library_entries_user_status_idx').on(table.userId, table.status),
  ],
)

// An outing represents shared facts about one actual theatre night. Opinions and
// private notes belong to outing attendees, never to the shared outing itself.
export const outings = pgTable(
  'outings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    productionId: uuid('production_id').references(() => productions.id, { onDelete: 'set null' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Fuzzy dates never invent a placeholder day. The service validates which
    // fields are present for each precision option.
    datePrecision: text('date_precision', {
      enum: ['exact', 'month', 'year', 'approximate', 'unknown'],
    })
      .notNull()
      .default('exact'),
    occurredOn: date('occurred_on'),
    occurredMonth: smallint('occurred_month'),
    occurredYear: smallint('occurred_year'),
    approximateDate: text('approximate_date'),
    startsAt: timestamp('starts_at'),
    venue: text('venue'),
    city: text('city'),
    country: text('country'),
    sharedNotes: text('shared_notes'),
    visibility: text('visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('outings_show_id_idx').on(table.showId),
    index('outings_created_by_user_id_idx').on(table.createdByUserId),
  ],
)

export const outingAttendees = pgTable(
  'outing_attendees',
  {
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    attendanceStatus: text('attendance_status', {
      enum: ['invited', 'accepted', 'declined'],
    })
      .notNull()
      .default('invited'),
    // Personal fields are intentionally separate from the outing's shared facts.
    rating: smallint('rating'),
    favorite: boolean('favorite').notNull().default(false),
    review: text('review'),
    reviewVisibility: text('review_visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    privateNotes: text('private_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.outingId, table.userId] }),
    index('outing_attendees_user_id_idx').on(table.userId),
  ],
)

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    visibility: text('visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('lists_user_id_idx').on(table.userId)],
)

export const listItems = pgTable(
  'list_items',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.listId, table.showId] })],
)

// One canonical row per pair. The service layer orders user IDs before insert
// and preserves requestedByUserId so inbound/outbound requests remain clear.
/**
 * Photographs people contribute for a show. The catalog's own cover art lives on
 * `shows.coverImageKey` and is administered; these belong to the person who
 * uploaded them.
 *
 * `visibility` is what the uploader asked for and `reviewStatus` is what an
 * administrator has decided. A photo offered publicly reaches approved friends
 * straight away but waits for review before it reaches everyone, because a
 * public image on a shared record is seen by signed-out visitors too.
 */
export const showImages = pgTable(
  'show_images',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    uploadedByUserId: text('uploaded_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    visibility: text('visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    reviewStatus: text('review_status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('show_images_show_idx').on(table.showId),
    index('show_images_uploader_idx').on(table.uploadedByUserId),
  ],
)

/**
 * Something a member wants an administrator to see: a bug, or an idea.
 *
 * The page they were on is captured because the most useful part of a bug
 * report is usually the thing the reporter forgets to mention.
 */
/**
 * Something somebody wrote at length.
 *
 * Separate from a review, which is a field on an attendee row: your reaction to
 * one night, finished the evening you write it. A piece is edited for years, has
 * a title, and exists in draft before anybody sees it. Forcing one shape onto
 * both would spoil whichever lost.
 *
 * A piece is normally *about* something — a show, a staging, a theatre, a
 * performer, a night — which is what keeps this a theatre journal rather than a
 * general blog nobody maintains. It also means writing accumulates onto the
 * pages it concerns instead of scrolling away.
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    body: text('body').notNull(),
    /** Editorial is an administrator writing for everybody, not a separate system. */
    kind: text('kind', { enum: ['piece', 'editorial'] })
      .notNull()
      .default('piece'),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    visibility: text('visibility', { enum: ['private', 'friends', 'public'] })
      .notNull()
      .default('friends'),
    /**
     * The name this is published under.
     *
     * A public profile carries no name by design, and an essay wants one. The
     * two are kept apart: a byline is chosen for the piece, and never links to
     * the author's profile, so publishing does not quietly put a real name on
     * everything else they have marked public.
     */
    byline: text('byline'),
    // What it is about. Nullable and mutually exclusive in practice, spelled out
    // rather than made polymorphic so a show page can simply ask for its own.
    showId: uuid('show_id').references(() => shows.id, { onDelete: 'cascade' }),
    productionId: uuid('production_id').references(() => productions.id, {
      onDelete: 'set null',
    }),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    outingId: uuid('outing_id').references(() => outings.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('posts_author_idx').on(table.authorUserId),
    index('posts_published_idx').on(table.status, table.publishedAt),
    index('posts_show_idx').on(table.showId),
    index('posts_venue_idx').on(table.venueId),
  ],
)

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportedByUserId: text('reported_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['bug', 'idea'] }).notNull(),
    message: text('message').notNull(),
    path: text('path'),
    status: text('status', { enum: ['open', 'resolved'] })
      .notNull()
      .default('open'),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('reports_status_idx').on(table.status)],
)

/**
 * What an administrator wrote back about a report.
 *
 * A table rather than a column on `reports`, because answering a bug is rarely
 * one sentence: "looking at it", then "fixed, deploying tonight". The reporter
 * gets each one by email, and both sides can read the thread.
 */
export const reportReplies = pgTable(
  'report_replies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('report_replies_report_idx').on(table.reportId)],
)

/**
 * Who an attendee says they actually saw on a particular night.
 *
 * The likely cast is worked out from casting dates, which cannot know that an
 * understudy went on. This table is the record that overrides that guess: once
 * somebody has said who they saw, their word replaces the inference for them.
 * It is per attendee, because two people at the same performance saw the same
 * stage but only each of them can vouch for their own memory of it.
 */
export const seenPerformers = pgTable(
  'seen_performers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outingId: uuid('outing_id')
      .notNull()
      .references(() => outings.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    // Kept alongside so a correction can say which part they went on for, even
    // when that person holds no recorded casting in this production.
    role: text('role'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('seen_performers_unique').on(table.outingId, table.userId, table.personId),
    index('seen_performers_outing_idx').on(table.outingId, table.userId),
  ],
)

/**
 * A key that lets somebody's own agent act as them.
 *
 * The point is a person pointing Claude Code — or anything else that can read
 * the web properly — at their own account, to research a show and enter it. The
 * app's own model runs in the house and is small; it read a cast table and put
 * Tony Danza under Leo Bloom. A better reader fixes that, and lives elsewhere.
 *
 * So a key is that member. It carries no scope column and no permission bits,
 * because a second permission system that has to be kept in step with the real
 * one is how a hole gets in: every call goes through the same functions a
 * signed-in person's clicks do, and sees exactly what they see. What a key
 * cannot do is anything they could not — including publishing to the catalog,
 * which stays with review.
 *
 * Only the hash is kept. A plain SHA-256 rather than a password hash on
 * purpose: these are 160 bits from a CSPRNG, so there is no dictionary to run
 * and nothing for a slow hash to buy. The token is shown once, at creation, and
 * is not recoverable afterwards.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** What it is for, in the owner's words: "laptop", "the mac mini". */
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** The opening characters, so a key can be told apart in a list and revoked. */
    prefix: text('prefix').notNull(),
    /** Answers "is this one still in use?", which is what makes revoking safe. */
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('api_keys_user_idx').on(table.userId)],
)

export const friendships = pgTable(
  'friendships',
  {
    userOneId: text('user_one_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userTwoId: text('user_two_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted', 'blocked'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userOneId, table.userTwoId] }),
    index('friendships_user_one_status_idx').on(table.userOneId, table.status),
    index('friendships_user_two_status_idx').on(table.userTwoId, table.status),
  ],
)
