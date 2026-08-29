import { eq } from 'drizzle-orm'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { generateHandle, isValidHandle, normalizeHandle } from '../lib/handle'
import { sendEmail } from './email'
import { getDb } from './db/client'
import * as schema from './db/schema'

/**
 * Settles on the handle an account will carry.
 *
 * A chosen handle is used when it is valid and free; otherwise one is generated
 * from the display name. Nothing here reads the email address: a handle is shown
 * to friends and to administrators, and an earlier email-derived scheme meant a
 * handle could confirm a guessed address.
 */
async function resolveHandle(requested: string | undefined, name: string | undefined) {
  const wanted = requested ? normalizeHandle(requested) : ''
  if (wanted && isValidHandle(wanted) && (await isHandleFree(wanted))) return wanted

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateHandle(name)
    if (await isHandleFree(candidate)) return candidate
  }
  throw new Error('Unable to allocate a handle. Please try again.')
}

async function isHandleFree(handle: string) {
  const [taken] = await getDb()
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.handle, handle))
    .limit(1)
  return !taken
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: 'pg', schema, transaction: true }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    customSyntheticUser: ({ coreFields, id }) => ({
      ...coreFields,
      handle: generateHandle(coreFields.name),
      profileVisibility: 'private',
      role: 'member',
      id,
    }),
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Broadway Tracker password',
        text: `Reset your password by visiting:\n${url}`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your Broadway Tracker email',
        text: `Verify your email by visiting:\n${url}`,
      })
    },
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  account: {
    // OAuth identities may only be linked from an authenticated account session.
    accountLinking: { disableImplicitLinking: true },
  },
  user: {
    additionalFields: {
      // Accepted at sign-up so a person can choose their own; validated and
      // deduplicated in the create hook below before it is stored.
      handle: { type: 'string', required: false, input: true },
      profileVisibility: {
        type: ['private', 'friends', 'public'],
        required: false,
        defaultValue: 'private',
        input: false,
      },
      role: { type: ['member', 'admin'], required: false, defaultValue: 'member', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            handle: await resolveHandle(
              (user as { handle?: string }).handle,
              (user as { name?: string }).name,
            ),
          },
        }),
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
