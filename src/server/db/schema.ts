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
    .default('private'),
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
    catalogStatus: text('catalog_status', { enum: ['pending', 'published', 'rejected'] })
      .notNull()
      .default('pending'),
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

export const productions = pgTable(
  'productions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    productionType: text('production_type', {
      enum: ['broadway', 'off_broadway', 'tour', 'regional', 'local', 'other'],
    }).notNull(),
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
      .default('private'),
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
      .default('private'),
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
      .default('private'),
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
      .default('private'),
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
