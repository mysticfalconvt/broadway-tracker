import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { listItems, lists, shows } from './db/schema'

async function requireSession() {
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

export const getMyLists = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await requireSession()
  const ownLists = await getDb()
    .select()
    .from(lists)
    .where(eq(lists.userId, session.user.id))
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

export const createList = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional(),
      visibility: z.enum(['private', 'friends']).default('private'),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    const [list] = await getDb()
      .insert(lists)
      .values({ userId: session.user.id, ...data, description: data.description || null })
      .returning({ id: lists.id })
    if (!list) throw new Error('Unable to create list.')
    return list
  })

async function requireOwnedList(listId: string) {
  const session = await requireSession()
  const [list] = await getDb()
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, session.user.id)))
    .limit(1)
  if (!list) throw new Error('List not found')
  return list
}

export const getMyList = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const list = await requireOwnedList(data.id)
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
    return { ...list, items }
  })

export const addShowToList = createServerFn({ method: 'POST' })
  .validator(z.object({ listId: z.string().uuid(), showId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const list = await requireOwnedList(data.listId)
    const [show] = await getDb()
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, data.showId), eq(shows.catalogStatus, 'published')))
      .limit(1)
    if (!show) throw new Error('Choose a published show.')
    const existing = await getDb()
      .select({ showId: listItems.showId })
      .from(listItems)
      .where(eq(listItems.listId, list.id))
    await getDb()
      .insert(listItems)
      .values({ listId: list.id, showId: data.showId, position: existing.length })
      .onConflictDoNothing()
  })

export const removeShowFromList = createServerFn({ method: 'POST' })
  .validator(z.object({ listId: z.string().uuid(), showId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const list = await requireOwnedList(data.listId)
    await getDb()
      .delete(listItems)
      .where(and(eq(listItems.listId, list.id), eq(listItems.showId, data.showId)))
  })

export const moveListItem = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      listId: z.string().uuid(),
      showId: z.string().uuid(),
      direction: z.enum(['up', 'down']),
    }),
  )
  .handler(async ({ data }) => {
    const list = await requireOwnedList(data.listId)
    await getDb().transaction(async (tx) => {
      const items = await tx
        .select()
        .from(listItems)
        .where(eq(listItems.listId, list.id))
        .orderBy(asc(listItems.position))
      const index = items.findIndex((item) => item.showId === data.showId)
      const swapIndex = data.direction === 'up' ? index - 1 : index + 1
      if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return
      const current = items[index]
      const swap = items[swapIndex]
      if (!current || !swap) return
      await tx
        .update(listItems)
        .set({ position: -1 })
        .where(and(eq(listItems.listId, list.id), eq(listItems.showId, current.showId)))
      await tx
        .update(listItems)
        .set({ position: current.position })
        .where(and(eq(listItems.listId, list.id), eq(listItems.showId, swap.showId)))
      await tx
        .update(listItems)
        .set({ position: swap.position })
        .where(and(eq(listItems.listId, list.id), eq(listItems.showId, current.showId)))
    })
  })
