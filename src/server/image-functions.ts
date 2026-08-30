import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { getDb } from './db/client'
import { showImages, shows, user } from './db/schema'
import { areFriends } from './friend-functions'
import { defaultVisibilityFor } from './visibility'
import { inspectImage } from './image-validation'
import { type Actor, assertAdmin } from './catalog-functions'
import { buildObjectKey, deleteImage, putImage } from './storage'

/**
 * Decides whether a viewer may read a stored object. The bucket has no public
 * access and every read is proxied, so this is the only gate -- there is no
 * shareable URL that bypasses it.
 */
export const canViewImage = createServerOnlyFn(
  async (viewerId: string | null, key: string): Promise<boolean> => {
    const prefix = key.split('/')[0]
    const db = getDb()

    if (prefix === 'shows') {
      // Cover art belongs to the catalog, so it is as visible as the show is.
      // A pending or rejected submission's artwork stays unreachable.
      const [row] = await db
        .select({ id: shows.id })
        .from(shows)
        .where(
          and(eq(shows.coverImageKey, key), inArray(shows.catalogStatus, ['published', 'local'])),
        )
        .limit(1)
      return Boolean(row)
    }

    if (prefix === 'show-photos') {
      const [photo] = await db
        .select({
          uploadedByUserId: showImages.uploadedByUserId,
          visibility: showImages.visibility,
          reviewStatus: showImages.reviewStatus,
        })
        .from(showImages)
        .where(eq(showImages.objectKey, key))
        .limit(1)
      if (!photo) return false
      // Approved public photos are the only ones a signed-out visitor sees.
      const isPubliclyApproved = photo.visibility === 'public' && photo.reviewStatus === 'approved'
      if (isPubliclyApproved) return true
      if (!viewerId) return false
      if (photo.uploadedByUserId === viewerId) return true
      // Offered publicly but not yet reviewed, or offered to friends: approved
      // friends may see it. A rejected photo goes back to the uploader alone.
      if (photo.reviewStatus === 'rejected') return false
      if (photo.visibility === 'private') return false
      return areFriends(viewerId, photo.uploadedByUserId)
    }

    if (prefix === 'avatars') {
      // Public profiles are anonymous, so a face is never served publicly --
      // only to the owner and to approved friends.
      if (!viewerId) return false
      const [owner] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.image, key))
        .limit(1)
      if (!owner) return false
      if (owner.id === viewerId) return true
      return areFriends(viewerId, owner.id)
    }

    return false
  },
)

/** Replaces a user's avatar, removing the object the row previously pointed at. */
export const setAvatarForUser = createServerOnlyFn(async (userId: string, bytes: Uint8Array) => {
  const info = inspectImage(bytes)
  const db = getDb()
  const [current] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId))

  const key = buildObjectKey('avatars', info.format)
  await putImage(key, bytes, info.format)
  await db.update(user).set({ image: key, updatedAt: new Date() }).where(eq(user.id, userId))

  // Only drop the old object once nothing references it, so a failure here
  // leaves an orphan rather than a broken image.
  if (current?.image && current.image !== key) await deleteImage(current.image)
  return key
})

/** Replaces a show's cover art. Catalog edits are an administrator action. */
export const setShowCover = createServerOnlyFn(
  async (actor: Actor, showId: string, bytes: Uint8Array) => {
    assertAdmin(actor)
    const info = inspectImage(bytes)
    const db = getDb()
    const [current] = await db
      .select({ coverImageKey: shows.coverImageKey })
      .from(shows)
      .where(eq(shows.id, showId))
    if (!current) throw new Error('That show does not exist.')

    const key = buildObjectKey('shows', info.format)
    await putImage(key, bytes, info.format)
    await db
      .update(shows)
      .set({ coverImageKey: key, updatedAt: new Date() })
      .where(eq(shows.id, showId))

    if (current.coverImageKey && current.coverImageKey !== key) {
      await deleteImage(current.coverImageKey)
    }
    return key
  },
)

export const removeAvatarForUser = createServerOnlyFn(async (userId: string) => {
  const db = getDb()
  const [current] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId))
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, userId))
  if (current?.image) await deleteImage(current.image)
})

/** Attaches a contributed photograph to a show. */
export const addShowPhoto = createServerOnlyFn(
  async (
    userId: string,
    showId: string,
    bytes: Uint8Array,
    visibility?: 'private' | 'friends' | 'public',
  ) => {
    const info = inspectImage(bytes)
    const db = getDb()
    const [show] = await db
      .select({ id: shows.id })
      .from(shows)
      .where(and(eq(shows.id, showId), inArray(shows.catalogStatus, ['published', 'local'])))
      .limit(1)
    if (!show) throw new Error('Choose a published show from the catalog.')

    const key = buildObjectKey('show-photos', info.format)
    await putImage(key, bytes, info.format)
    const [row] = await db
      .insert(showImages)
      .values({
        showId,
        uploadedByUserId: userId,
        objectKey: key,
        // Follows the profile like everything else. Offering it publicly still
        // means friends first and everyone only after review, so an inherited
        // public setting cannot put a photograph straight in front of strangers.
        visibility: visibility ?? (await defaultVisibilityFor(userId)),
      })
      .returning({ id: showImages.id, objectKey: showImages.objectKey })
    if (!row) throw new Error('Unable to save that photo.')
    return row
  },
)

/** The photographs a viewer may see for a show, newest first. */
export const showPhotosForViewer = createServerOnlyFn(
  async (viewerId: string | null, showId: string) => {
    const db = getDb()
    const rows = await db
      .select({
        id: showImages.id,
        objectKey: showImages.objectKey,
        visibility: showImages.visibility,
        reviewStatus: showImages.reviewStatus,
        uploadedByUserId: showImages.uploadedByUserId,
        uploaderName: user.name,
        createdAt: showImages.createdAt,
      })
      .from(showImages)
      .innerJoin(user, eq(showImages.uploadedByUserId, user.id))
      .where(eq(showImages.showId, showId))
      .orderBy(desc(showImages.createdAt))

    const visible = []
    for (const row of rows) {
      if (await canViewImage(viewerId, row.objectKey)) {
        const isOwn = row.uploadedByUserId === viewerId
        visible.push({
          id: row.id,
          objectKey: row.objectKey,
          isOwn,
          visibility: row.visibility,
          reviewStatus: row.reviewStatus,
          // A public page is anonymous, so a contributor is named only to
          // people who already know them.
          uploaderName: isOwn || viewerId ? row.uploaderName : null,
        })
      }
    }
    return visible
  },
)

/**
 * The cover to show a given viewer for a show, chosen deterministically: their
 * own photograph first, then the administered catalog cover, then the most
 * recent publicly approved contribution. Never random -- a show that looked
 * different on every visit would be unrecognisable, and a cover picked at
 * render time would not survive hydration.
 */
export const resolveCoverForViewer = createServerOnlyFn(
  async (viewerId: string | null, showId: string) => {
    const db = getDb()
    if (viewerId) {
      const [own] = await db
        .select({ objectKey: showImages.objectKey })
        .from(showImages)
        .where(and(eq(showImages.showId, showId), eq(showImages.uploadedByUserId, viewerId)))
        .orderBy(desc(showImages.createdAt))
        .limit(1)
      if (own) return own.objectKey
    }
    const [show] = await db
      .select({ coverImageKey: shows.coverImageKey })
      .from(shows)
      .where(eq(shows.id, showId))
      .limit(1)
    if (show?.coverImageKey) return show.coverImageKey

    const [approved] = await db
      .select({ objectKey: showImages.objectKey })
      .from(showImages)
      .where(
        and(
          eq(showImages.showId, showId),
          eq(showImages.visibility, 'public'),
          eq(showImages.reviewStatus, 'approved'),
        ),
      )
      .orderBy(desc(showImages.createdAt))
      .limit(1)
    return approved?.objectKey ?? null
  },
)

/** Photographs offered publicly and still awaiting a decision. */
export const pendingShowPhotosForAdmin = createServerOnlyFn(async (actor: Actor) => {
  assertAdmin(actor)
  return getDb()
    .select({
      id: showImages.id,
      objectKey: showImages.objectKey,
      showTitle: shows.title,
      uploaderName: user.name,
      createdAt: showImages.createdAt,
    })
    .from(showImages)
    .innerJoin(shows, eq(showImages.showId, shows.id))
    .innerJoin(user, eq(showImages.uploadedByUserId, user.id))
    .where(and(eq(showImages.visibility, 'public'), eq(showImages.reviewStatus, 'pending')))
    .orderBy(desc(showImages.createdAt))
})

export const reviewShowPhoto = createServerOnlyFn(
  async (actor: Actor, id: string, approve: boolean) => {
    assertAdmin(actor)
    await getDb()
      .update(showImages)
      .set({
        reviewStatus: approve ? 'approved' : 'rejected',
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(showImages.id, id))
  },
)

/** Removes a contributed photo. The uploader or an administrator may do this. */
export const removeShowPhoto = createServerOnlyFn(async (actor: Actor, id: string) => {
  const db = getDb()
  const [photo] = await db
    .select({ objectKey: showImages.objectKey, uploadedByUserId: showImages.uploadedByUserId })
    .from(showImages)
    .where(eq(showImages.id, id))
    .limit(1)
  if (!photo) return
  if (photo.uploadedByUserId !== actor.id && actor.role !== 'admin') {
    throw new Error('Forbidden')
  }
  await db.delete(showImages).where(eq(showImages.id, id))
  await deleteImage(photo.objectKey)
})

async function requireSession() {
  const { auth } = await import('./auth')
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  if (!session) throw new Error('Unauthorized')
  return session
}

async function optionalViewerId() {
  const { auth } = await import('./auth')
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const session = await auth.api.getSession({ headers: getRequestHeaders() })
  return session?.user.id ?? null
}

export const getShowPhotos = createServerFn({ method: 'GET' })
  .validator(z.object({ showId: z.string().uuid() }))
  .handler(async ({ data }) => showPhotosForViewer(await optionalViewerId(), data.showId))

export const deleteShowPhoto = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => removeShowPhoto((await requireSession()).user as Actor, data.id))

export const getPendingShowPhotos = createServerFn({ method: 'GET' }).handler(async () =>
  pendingShowPhotosForAdmin((await requireSession()).user as Actor),
)

export const decideShowPhoto = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), approve: z.boolean() }))
  .handler(async ({ data }) =>
    reviewShowPhoto((await requireSession()).user as Actor, data.id, data.approve),
  )

/**
 * Replaces catalog cover art with the viewer's own photograph, for the shows
 * they have contributed one to. Batched into a single query so a list screen
 * costs one extra round trip rather than one per row.
 */
export const applyViewerCovers = createServerOnlyFn(
  async <T extends { id: string; coverImageKey: string | null }>(
    viewerId: string | null,
    rows: T[],
  ): Promise<T[]> => {
    if (!viewerId || rows.length === 0) return rows
    const own = await getDb()
      .select({ showId: showImages.showId, objectKey: showImages.objectKey })
      .from(showImages)
      .where(
        and(
          eq(showImages.uploadedByUserId, viewerId),
          inArray(
            showImages.showId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(desc(showImages.createdAt))

    // Newest first, so the first key seen for a show is the one that wins.
    const mine = new Map<string, string>()
    for (const row of own) if (!mine.has(row.showId)) mine.set(row.showId, row.objectKey)
    if (mine.size === 0) return rows
    return rows.map((row) => ({ ...row, coverImageKey: mine.get(row.id) ?? row.coverImageKey }))
  },
)

/**
 * Changes who can see a contributed photograph.
 *
 * Offering one publicly sends it back for review, even if it was approved
 * before: what an administrator agreed to publish was the photograph at the
 * setting it had, and re-opening that decision is the point of the queue.
 */
export const setShowPhotoVisibility = createServerOnlyFn(
  async (userId: string, id: string, visibility: 'private' | 'friends' | 'public') => {
    const db = getDb()
    const [photo] = await db
      .select({ uploadedByUserId: showImages.uploadedByUserId, current: showImages.visibility })
      .from(showImages)
      .where(eq(showImages.id, id))
      .limit(1)
    if (!photo) throw new Error('That photograph is not here.')
    if (photo.uploadedByUserId !== userId) throw new Error('Forbidden')

    const becomingPublic = visibility === 'public' && photo.current !== 'public'
    await db
      .update(showImages)
      .set({
        visibility,
        ...(becomingPublic
          ? { reviewStatus: 'pending' as const, reviewedByUserId: null, reviewedAt: null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(showImages.id, id))
  },
)

export const changePhotoVisibility = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      visibility: z.enum(['private', 'friends', 'public']),
    }),
  )
  .handler(async ({ data }) =>
    setShowPhotoVisibility((await requireSession()).user.id, data.id, data.visibility),
  )
