import { sql } from 'drizzle-orm'

import { getDb } from '../src/server/db/client'
import {
  friendships,
  libraryEntries,
  listItems,
  lists,
  outingAttendees,
  outings,
  productions,
  shows,
  user,
} from '../src/server/db/schema'

export const db = getDb()

/** Wipes every domain table so each test starts from a known empty database. */
export async function resetDatabase() {
  await db.execute(sql`
    truncate table
      ${outingAttendees}, ${outings}, ${listItems}, ${lists},
      ${libraryEntries}, ${productions}, ${shows}, ${friendships}, ${user}
    restart identity cascade
  `)
}

let counter = 0
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`

export async function makeUser(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<typeof user.$inferSelect> {
  const id = overrides.id ?? nextId('user')
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: overrides.name ?? `Test ${id}`,
      email: overrides.email ?? `${id}@example.test`,
      handle: overrides.handle ?? id,
      emailVerified: overrides.emailVerified ?? true,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('Failed to insert user fixture')
  return row
}

export const makeAdmin = (overrides: Partial<typeof user.$inferInsert> = {}) =>
  makeUser({ role: 'admin', ...overrides })

/** Writes the canonical friendship row for a pair, matching the app's ordering. */
export async function makeFriendship(
  aId: string,
  bId: string,
  status: 'pending' | 'accepted' | 'blocked' = 'accepted',
  requestedByUserId = aId,
) {
  const [userOneId, userTwoId] = aId < bId ? [aId, bId] : [bId, aId]
  const [row] = await db
    .insert(friendships)
    .values({ userOneId, userTwoId, requestedByUserId, status })
    .returning()
  return row
}

export async function makeShow(
  overrides: Partial<typeof shows.$inferInsert> = {},
): Promise<typeof shows.$inferSelect> {
  const id = nextId('show')
  const [row] = await db
    .insert(shows)
    .values({
      title: overrides.title ?? `Show ${id}`,
      slug: overrides.slug ?? id,
      type: overrides.type ?? 'musical',
      catalogStatus: overrides.catalogStatus ?? 'published',
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('Failed to insert show fixture')
  return row
}

export async function makeList(
  userId: string,
  overrides: Partial<typeof lists.$inferInsert> = {},
): Promise<typeof lists.$inferSelect> {
  const [row] = await db
    .insert(lists)
    .values({
      userId,
      title: overrides.title ?? `List ${nextId('list')}`,
      visibility: overrides.visibility ?? 'private',
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('Failed to insert list fixture')
  return row
}

export async function makeLibraryEntry(
  userId: string,
  showId: string,
  overrides: Partial<typeof libraryEntries.$inferInsert> = {},
): Promise<typeof libraryEntries.$inferSelect> {
  const [row] = await db
    .insert(libraryEntries)
    .values({ userId, showId, status: overrides.status ?? 'want_to_see', ...overrides })
    .returning()
  if (!row) throw new Error('Failed to insert library entry fixture')
  return row
}
