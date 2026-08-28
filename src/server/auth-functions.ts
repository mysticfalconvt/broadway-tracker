import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { auth } from './auth'
import { getDb } from './db/client'
import { user } from './db/schema'

export const getSession = createServerFn({ method: 'GET' }).handler(async () =>
  auth.api.getSession({ headers: getRequestHeaders() }),
)

export const updateAccountSettings = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(100),
      handle: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9-]{2,29}$/, 'Use 3-30 lowercase letters, numbers, or hyphens.'),
      profileVisibility: z.enum(['private', 'friends']),
    }),
  )
  .handler(async ({ data }) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session) throw new Error('Unauthorized')

    try {
      const [updatedUser] = await getDb()
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, session.user.id))
        .returning({
          name: user.name,
          handle: user.handle,
          profileVisibility: user.profileVisibility,
        })

      if (!updatedUser) throw new Error('Account not found')
      return updatedUser
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('That handle is already in use.')
      }
      throw error
    }
  })
