import { createServerOnlyFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'

import { getDb } from './db/client'
import { shows, user } from './db/schema'
import { areFriends } from './friend-functions'
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
        .where(and(eq(shows.coverImageKey, key), eq(shows.catalogStatus, 'published')))
        .limit(1)
      return Boolean(row)
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
