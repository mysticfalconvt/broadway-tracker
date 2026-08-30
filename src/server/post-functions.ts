import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { currentSession, requireSession } from './session'

import type { Actor } from './catalog-functions'
import { getDb } from './db/client'
import { outingAttendees, outings, people, posts, shows, user, venues } from './db/schema'
import { acceptedFriendIdsFor } from './friend-functions'
import { defaultVisibilityFor } from './visibility'

export const postInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
  visibility: z.enum(['private', 'friends', 'public']).optional(),
  byline: z.string().trim().max(80).optional(),
  showId: z.string().uuid().optional(),
  productionId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  personId: z.string().uuid().optional(),
  outingId: z.string().uuid().optional(),
})

function toSlug(title: string) {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
  return base || 'piece'
}

/** Enough of a piece to list it without sending the whole thing. */
const summary = {
  id: posts.id,
  title: posts.title,
  slug: posts.slug,
  kind: posts.kind,
  status: posts.status,
  visibility: posts.visibility,
  byline: posts.byline,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
  showId: posts.showId,
  venueId: posts.venueId,
  personId: posts.personId,
  outingId: posts.outingId,
  showTitle: shows.title,
  showSlug: shows.slug,
  venueName: venues.name,
  personName: people.name,
  // The first breath of it, for a listing.
  opening: sql<string>`left(${posts.body}, 240)`,
}

/**
 * Who may read a published piece.
 *
 * Public reaches anybody at all, signed in or not — that is what makes an essay
 * worth writing. Friends-only reaches approved friends. A draft is nobody's but
 * its author's, whatever its visibility says.
 */
async function readableBy(viewerId: string | null) {
  if (!viewerId) return eq(posts.visibility, 'public')
  const friendIds = [...(await acceptedFriendIdsFor(viewerId))]
  return or(
    eq(posts.visibility, 'public'),
    eq(posts.authorUserId, viewerId),
    friendIds.length
      ? and(eq(posts.visibility, 'friends'), inArray(posts.authorUserId, friendIds))
      : undefined,
  )
}

export const createPostForAuthor = createServerOnlyFn(
  async (
    authorUserId: string,
    data: z.infer<typeof postInput>,
    kind: 'piece' | 'editorial' = 'piece',
  ) => {
    const db = getDb()
    const visibility = data.visibility ?? (await defaultVisibilityFor(authorUserId))
    const base = toSlug(data.title)
    for (let suffix = 1; suffix <= 100; suffix++) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`
      const [created] = await db
        .insert(posts)
        .values({
          authorUserId,
          title: data.title,
          slug,
          body: data.body,
          kind,
          visibility,
          byline: data.byline || null,
          showId: data.showId ?? null,
          productionId: data.productionId ?? null,
          venueId: data.venueId ?? null,
          personId: data.personId ?? null,
          outingId: data.outingId ?? null,
        })
        .onConflictDoNothing({ target: posts.slug })
        .returning({ id: posts.id, slug: posts.slug, title: posts.title })
      if (created) return created
    }
    throw new Error('Unable to find a free address for that title.')
  },
)

/** The author's own, or an administrator's, since they can unpublish anything. */
const requireOwnPost = createServerOnlyFn(async (actor: Actor, postId: string) => {
  const [post] = await getDb().select().from(posts).where(eq(posts.id, postId)).limit(1)
  // The same answer as a piece that does not exist, so this never confirms one.
  if (!post) throw new Error('That piece is not here.')
  if (post.authorUserId !== actor.id && actor.role !== 'admin') {
    throw new Error('That piece is not here.')
  }
  return post
})

export const updatePost = createServerOnlyFn(
  async (actor: Actor, postId: string, data: z.infer<typeof postInput>) => {
    const post = await requireOwnPost(actor, postId)
    await getDb()
      .update(posts)
      .set({
        title: data.title,
        body: data.body,
        visibility: data.visibility ?? post.visibility,
        byline: data.byline || null,
        showId: data.showId ?? null,
        productionId: data.productionId ?? null,
        venueId: data.venueId ?? null,
        personId: data.personId ?? null,
        outingId: data.outingId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, post.id))
    return { id: post.id, slug: post.slug }
  },
)

/**
 * Publishing is a deliberate act, which is the point of drafts: the difference
 * between saved and published is what makes somebody willing to start.
 */
export const publishPost = createServerOnlyFn(async (actor: Actor, postId: string) => {
  const post = await requireOwnPost(actor, postId)
  if (!post.body.trim()) throw new Error('There is nothing to publish yet.')
  await getDb()
    .update(posts)
    .set({
      status: 'published',
      // Kept from the first publication: unpublishing and publishing again is
      // a correction, not a new piece.
      publishedAt: post.publishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id))
  return { id: post.id, slug: post.slug }
})

export const unpublishPost = createServerOnlyFn(async (actor: Actor, postId: string) => {
  const post = await requireOwnPost(actor, postId)
  await getDb()
    .update(posts)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(eq(posts.id, post.id))
})

export const deletePost = createServerOnlyFn(async (actor: Actor, postId: string) => {
  const post = await requireOwnPost(actor, postId)
  await getDb().delete(posts).where(eq(posts.id, post.id))
})

/** One piece, if this reader may have it. */
export const postForReader = createServerOnlyFn(async (viewerId: string | null, slug: string) => {
  const [post] = await getDb()
    .select({
      ...summary,
      body: posts.body,
      authorUserId: posts.authorUserId,
      authorName: user.name,
    })
    .from(posts)
    .innerJoin(user, eq(posts.authorUserId, user.id))
    .leftJoin(shows, eq(posts.showId, shows.id))
    .leftJoin(venues, eq(posts.venueId, venues.id))
    .leftJoin(people, eq(posts.personId, people.id))
    .where(and(eq(posts.slug, slug), await readableBy(viewerId)))
    .limit(1)
  if (!post) return null
  // A draft is nobody's but its author's, however open its visibility.
  if (post.status === 'draft' && post.authorUserId !== viewerId) return null
  return {
    ...post,
    // Only the author needs to know who wrote it; everybody else gets the
    // byline they chose, and no link back to an anonymous profile.
    authorName: post.authorUserId === viewerId ? post.authorName : null,
    isMine: post.authorUserId === viewerId,
  }
})

/** Everything published that this reader may have, newest first. */
export const postsForReader = createServerOnlyFn(async (viewerId: string | null, limit = 20) =>
  getDb()
    .select(summary)
    .from(posts)
    .leftJoin(shows, eq(posts.showId, shows.id))
    .leftJoin(venues, eq(posts.venueId, venues.id))
    .leftJoin(people, eq(posts.personId, people.id))
    .where(
      and(eq(posts.status, 'published'), isNotNull(posts.publishedAt), await readableBy(viewerId)),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit),
)

/** Pieces written about one thing, for its own page. */
export const postsAbout = createServerOnlyFn(
  async (
    viewerId: string | null,
    subject: { showId?: string; venueId?: string; personId?: string },
  ) => {
    const target = subject.showId
      ? eq(posts.showId, subject.showId)
      : subject.venueId
        ? eq(posts.venueId, subject.venueId)
        : subject.personId
          ? eq(posts.personId, subject.personId)
          : null
    if (!target) return []
    return getDb()
      .select(summary)
      .from(posts)
      .leftJoin(shows, eq(posts.showId, shows.id))
      .leftJoin(venues, eq(posts.venueId, venues.id))
      .leftJoin(people, eq(posts.personId, people.id))
      .where(and(eq(posts.status, 'published'), target, await readableBy(viewerId)))
      .orderBy(desc(posts.publishedAt))
  },
)

/** An author's own, drafts included, with the text so it can be edited. */
export const postsByAuthor = createServerOnlyFn(async (authorUserId: string) =>
  getDb()
    .select({ ...summary, body: posts.body })
    .from(posts)
    .leftJoin(shows, eq(posts.showId, shows.id))
    .leftJoin(venues, eq(posts.venueId, venues.id))
    .leftJoin(people, eq(posts.personId, people.id))
    .where(eq(posts.authorUserId, authorUserId))
    .orderBy(desc(posts.updatedAt)),
)

/**
 * Starts a piece from a review that outgrew its box.
 *
 * The review stays exactly where it was. This is the path from short to long
 * without collapsing two things that have different lives — a review is
 * finished the night you write it, a piece is edited for years.
 */
export const pieceFromReview = createServerOnlyFn(
  async (authorUserId: string, outingId: string) => {
    const [row] = await getDb()
      .select({
        review: outingAttendees.review,
        showTitle: shows.title,
        showId: outings.showId,
        visibility: outingAttendees.reviewVisibility,
      })
      .from(outingAttendees)
      .innerJoin(outings, eq(outingAttendees.outingId, outings.id))
      .innerJoin(shows, eq(outings.showId, shows.id))
      .where(and(eq(outingAttendees.outingId, outingId), eq(outingAttendees.userId, authorUserId)))
      .limit(1)
    if (!row) throw new Error('That night is not yours.')
    if (!row.review?.trim()) throw new Error('There is no review to build on yet.')

    return createPostForAuthor(authorUserId, {
      title: row.showTitle,
      body: row.review,
      visibility: row.visibility,
      showId: row.showId,
      outingId,
    })
  },
)

export const savePost = createServerFn({ method: 'POST' })
  .validator(postInput.extend({ id: z.string().uuid().optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    const actor = session.user as Actor
    const { id, ...fields } = data
    if (id) return updatePost(actor, id, fields)
    // An administrator writing is editorial; everybody else is writing a piece.
    return createPostForAuthor(actor.id, fields, actor.role === 'admin' ? 'editorial' : 'piece')
  })

export const setPostPublished = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), published: z.boolean() }))
  .handler(async ({ data }) => {
    const actor = (await requireSession()).user as Actor
    return data.published ? publishPost(actor, data.id) : unpublishPost(actor, data.id)
  })

export const removePost = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => deletePost((await requireSession()).user as Actor, data.id))

export const getPost = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const session = await currentSession()
    return postForReader(session?.user.id ?? null, data.slug)
  })

export const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await currentSession()
  return postsForReader(session?.user.id ?? null)
})

export const getMyPosts = createServerFn({ method: 'GET' }).handler(async () =>
  postsByAuthor((await requireSession()).user.id),
)

export const startPieceFromReview = createServerFn({ method: 'POST' })
  .validator(z.object({ outingId: z.string().uuid() }))
  .handler(async ({ data }) => pieceFromReview((await requireSession()).user.id, data.outingId))

export const getPostsAbout = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      showId: z.string().uuid().optional(),
      venueId: z.string().uuid().optional(),
      personId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await currentSession()
    return postsAbout(session?.user.id ?? null, data)
  })
