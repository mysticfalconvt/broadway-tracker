import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { listItems, lists, shows, user } from './db/schema'
import { areFriends } from './friend-functions'
import { defaultVisibilityFor } from './visibility'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

/** Public lists are readable signed out, so this read tolerates no session. */
async function optionalViewerId() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user.id ?? null
}

// The exported `*ForOwner` / `*ForViewer` helpers hold the authorization rules and
// take the acting user explicitly, so they can be exercised without a request.
// Each server function below is a thin adapter that resolves the session.

const listInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  visibility: z.enum(['private', 'friends', 'public']).optional(),
})

export const listsForOwner = createServerOnlyFn(async (ownerId: string) => {
  const ownLists = await getDb()
    .select()
    .from(lists)
    .where(eq(lists.userId, ownerId))
    .orderBy(asc(lists.title))
  const counts = await Promise.all(
    ownLists.map(async (list) => ({
      id: list.id,
      count: (
        await getDb()
          .select({ id: listItems.showId })
          .from(listItems)
          .where(eq(listItems.listId, list.id))
      ).length,
    })),
  )
  return ownLists.map((list) => ({
    ...list,
    itemCount: counts.find((count) => count.id === list.id)?.count ?? 0,
  }))
})

export const createListForOwner = createServerOnlyFn(
  async (ownerId: string, input: z.infer<typeof listInput>) => {
    const [list] = await getDb()
      .insert(lists)
      .values({
        userId: ownerId,
        ...input,
        description: input.description || null,
        visibility: input.visibility ?? (await defaultVisibilityFor(ownerId)),
      })
      .returning({ id: lists.id })
    if (!list) throw new Error('Unable to create list.')
    return list
  },
)

const requireOwnedList = createServerOnlyFn(async (ownerId: string, listId: string) => {
  const [list] = await getDb()
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, ownerId)))
    .limit(1)
  if (!list) throw new Error('List not found')
  return list
})

/**
 * `viewerId` is null for a signed-out visitor, who may only reach a public list.
 * A public list is deliberately anonymous: it carries no owner name or handle.
 */
export const listForViewer = createServerOnlyFn(async (viewerId: string | null, listId: string) => {
  const [list] = await getDb().select().from(lists).where(eq(lists.id, listId)).limit(1)
  // A viewer who may not read the list gets the same answer as one asking for a
  // list that does not exist, so the response never confirms it is there.
  if (!list) throw new Error('List not found')
  const canEdit = viewerId !== null && list.userId === viewerId
  const isPublic = list.visibility === 'public'
  const isSharedWithFriend =
    list.visibility === 'friends' && viewerId !== null && (await areFriends(viewerId, list.userId))
  if (!canEdit && !isPublic && !isSharedWithFriend) throw new Error('List not found')

  // Only someone who already knows the owner sees who they are.
  const identified = canEdit || isSharedWithFriend
  const [owner] = identified
    ? await getDb()
        .select({ name: user.name, handle: user.handle })
        .from(user)
        .where(eq(user.id, list.userId))
        .limit(1)
    : [null]
  const items = await getDb()
    .select({
      showId: shows.id,
      title: shows.title,
      slug: shows.slug,
      type: shows.type,
      coverImageKey: shows.coverImageKey,
      position: listItems.position,
    })
    .from(listItems)
    .innerJoin(shows, eq(listItems.showId, shows.id))
    .where(eq(listItems.listId, list.id))
    .orderBy(asc(listItems.position))
  // Deliberately narrowed rather than spread. The row carries `userId`, the same
  // opaque id that addresses a public profile -- sending it to a stranger would
  // let every public list by one person be grouped and tied back to them, which
  // is exactly what the anonymity of a public page is meant to prevent.
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    visibility: list.visibility,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    userId: identified ? list.userId : null,
    items,
    canEdit,
    owner,
  }
})

export const addShowToOwnedList = createServerOnlyFn(
  async (ownerId: string, listId: string, showId: string) => {
    const list = await requireOwnedList(ownerId, listId)
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, showId), inArray(shows.catalogStatus, ['published', 'local'])))
      .limit(1)
    if (!show) throw new Error('Choose a published show.')
    const existing = await getDb()
      .select({ showId: listItems.showId })
      .from(listItems)
      .where(eq(listItems.listId, list.id))
    await getDb()
      .insert(listItems)
      .values({ listId: list.id, showId, position: existing.length })
      .onConflictDoNothing()
  },
)

export const removeShowFromOwnedList = createServerOnlyFn(
  async (ownerId: string, listId: string, showId: string) => {
    const list = await requireOwnedList(ownerId, listId)
    await getDb()
      .delete(listItems)
      .where(and(eq(listItems.listId, list.id), eq(listItems.showId, showId)))
  },
)

export const moveItemInOwnedList = createServerOnlyFn(
  async (ownerId: string, listId: string, showId: string, direction: 'up' | 'down') => {
    const list = await requireOwnedList(ownerId, listId)
    await getDb().transaction(async (tx) => {
      const items = await tx
        .select()
        .from(listItems)
        .where(eq(listItems.listId, list.id))
        .orderBy(asc(listItems.position))
      const index = items.findIndex((item) => item.showId === showId)
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return
      const current = items[index]
      const swap = items[swapIndex]
      if (!current || !swap) return
      await tx
        .update(listItems)
        .set({ position: swap.position })
        .where(and(eq(listItems.listId, list.id), eq(listItems.showId, current.showId)))
      await tx
        .update(listItems)
        .set({ position: current.position })
        .where(and(eq(listItems.listId, list.id), eq(listItems.showId, swap.showId)))
    })
  },
)

export const getMyLists = createServerFn({ method: 'GET' }).handler(async () =>
  listsForOwner((await requireSession()).user.id),
)

export const createList = createServerFn({ method: 'POST' })
  .validator(listInput)
  .handler(async ({ data }) => createListForOwner((await requireSession()).user.id, data))

export const getListForViewer = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => listForViewer(await optionalViewerId(), data.id))

export const addShowToList = createServerFn({ method: 'POST' })
  .validator(z.object({ listId: z.string().uuid(), showId: z.string().uuid() }))
  .handler(async ({ data }) =>
    addShowToOwnedList((await requireSession()).user.id, data.listId, data.showId),
  )

export const removeShowFromList = createServerFn({ method: 'POST' })
  .validator(z.object({ listId: z.string().uuid(), showId: z.string().uuid() }))
  .handler(async ({ data }) =>
    removeShowFromOwnedList((await requireSession()).user.id, data.listId, data.showId),
  )

export const moveListItem = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      listId: z.string().uuid(),
      showId: z.string().uuid(),
      direction: z.enum(['up', 'down']),
    }),
  )
  .handler(async ({ data }) =>
    moveItemInOwnedList((await requireSession()).user.id, data.listId, data.showId, data.direction),
  )

/** Renames a list, or changes who can see it. */
export const updateOwnedList = createServerOnlyFn(
  async (
    ownerId: string,
    listId: string,
    input: { title: string; description?: string; visibility: 'private' | 'friends' | 'public' },
  ) => {
    const list = await requireOwnedList(ownerId, listId)
    await getDb()
      .update(lists)
      .set({
        title: input.title,
        description: input.description || null,
        visibility: input.visibility,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, list.id))
  },
)

export const saveList = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional(),
      visibility: z.enum(['private', 'friends', 'public']),
    }),
  )
  .handler(async ({ data }) => updateOwnedList((await requireSession()).user.id, data.id, data))
