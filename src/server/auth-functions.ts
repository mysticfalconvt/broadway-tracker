import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { currentSession } from './session'

import { getDb } from './db/client'
import { handleProblem, normalizeHandle } from '../lib/handle'
import { user } from './db/schema'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => currentSession())

export const updateAccountSettings = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(100),
      handle: z
        .string()
        .transform(normalizeHandle)
        .refine((value) => handleProblem(value) === null, {
          message: 'Use 3-30 lowercase letters, numbers, or hyphens.',
        }),
      profileVisibility: z.enum(['private', 'friends', 'public']),
      digestCadence: z.enum(['off', 'weekly', 'monthly']).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await currentSession()
    if (!session) throw new Error('Unauthorized')

    try {
      // Sharing is changed through its own path, because changing it brings
      // everything that was following the old setting along with it.
      const { applyProfileVisibility } = await import('./visibility')
      const sharing = await applyProfileVisibility(session.user.id, data.profileVisibility)

      const [updatedUser] = await getDb()
        .update(user)
        .set({
          name: data.name,
          handle: data.handle,
          ...(data.digestCadence ? { digestCadence: data.digestCadence } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, session.user.id))
        .returning({
          name: user.name,
          handle: user.handle,
          profileVisibility: user.profileVisibility,
          digestCadence: user.digestCadence,
        })

      if (!updatedUser) throw new Error('Account not found')
      return { ...updatedUser, sharing }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('That handle is already in use.')
      }
      throw error
    }
  })

/** How much would move if this person changed their profile sharing. */
export const getSharingImpact = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await currentSession()
  if (!session) throw new Error('Unauthorized')
  const { contentFollowingProfile } = await import('./visibility')
  return contentFollowingProfile(session.user.id)
})

/** Whether a handle is free, for live feedback while someone is choosing one. */
export const checkHandle = createServerFn({ method: 'GET' })
  .validator(z.object({ handle: z.string().trim().max(40) }))
  .handler(async ({ data }) => {
    const handle = normalizeHandle(data.handle)
    const problem = handleProblem(data.handle)
    if (problem) return { handle, available: false, problem }
    const [taken] = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(eq(user.handle, handle))
      .limit(1)
    return {
      handle,
      available: !taken,
      problem: taken ? 'That handle is already taken.' : null,
    }
  })
