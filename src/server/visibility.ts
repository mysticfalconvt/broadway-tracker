import { createServerOnlyFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { getDb } from './db/client'
import { user } from './db/schema'

export type Visibility = 'private' | 'friends' | 'public'

/**
 * The sharing level new content takes when the person did not choose one.
 *
 * It follows their profile setting rather than a fixed constant, so "I share
 * openly" or "I keep to myself" is stated once and everything they make follows
 * it. Anything explicitly chosen on a form always wins over this.
 */
export const defaultVisibilityFor = createServerOnlyFn(
  async (userId: string): Promise<Visibility> => {
    const [row] = await getDb()
      .select({ profileVisibility: user.profileVisibility })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return (row?.profileVisibility as Visibility) ?? 'friends'
  },
)
