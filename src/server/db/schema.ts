import {
  boolean,
  date,
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
