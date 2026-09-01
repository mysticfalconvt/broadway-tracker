import { eq } from 'drizzle-orm'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { type Role, roleFor } from '../lib/admin-roles'
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

/**
 * Brings an existing account's role in line with `ADMIN_EMAILS` at sign-in.
 * A deployment changes the variable and redeploys; the next sign-in settles it.
 */
async function reconcileRole(userId: string) {
  const [row] = await getDb()
    .select({ email: schema.user.email, role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)
  if (!row) return
  const next = roleFor(row.email, row.role as Role, process.env.ADMIN_EMAILS)
  if (!next) return
  await getDb()
    .update(schema.user)
    .set({ role: next, updatedAt: new Date() })
    .where(eq(schema.user.id, userId))
  console.info('[auth] role reconciled from ADMIN_EMAILS', { role: next })
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
      profileVisibility: 'public',
      digestCadence: 'weekly',
      role: roleFor(coreFields.email, 'member', process.env.ADMIN_EMAILS) ?? 'member',
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
    accountLinking: {
      // OAuth identities may only be linked from an authenticated session.
      // This is the guard that matters: without it, signing in with a provider
      // whose email happens to match an existing account would hand over that
      // account, and whether the provider verified the address is the
      // provider's business rather than ours.
      disableImplicitLinking: true,
      /**
       * A provider account may carry a different address to the one somebody
       * signs in with, and usually does. People keep an address they use and a
       * Google account they log in with, and requiring the two to match means
       * the person it would help most is the one it refuses.
       *
       * Safe only because of the line above. Linking never happens on the way
       * in — it happens from a session that is already authenticated, so
       * whoever asks for it has proved they hold both. Turning this on while
       * implicit linking was allowed would be an account-takeover route.
       */
      allowDifferentEmails: true,
    },
  },
  user: {
    additionalFields: {
      // Accepted at sign-up so a person can choose their own; validated and
      // deduplicated in the create hook below before it is stored.
      handle: { type: 'string', required: false, input: true },
      profileVisibility: {
        type: ['private', 'friends', 'public'],
        required: false,
        // Must match the column default in the schema. Better Auth applies this
        // itself, overriding both the database default and the synthetic-user
        // hook, so changing one without the other silently does nothing.
        defaultValue: 'public',
        input: false,
      },
      digestCadence: {
        type: ['off', 'weekly', 'monthly'],
        required: false,
        // Same trap as profileVisibility: Better Auth applies this itself and
        // wins over the column default, so the two must be changed together.
        defaultValue: 'weekly',
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
    session: {
      create: {
        before: async (session) => {
          // Sign-in is the moment an account's role can safely be settled.
          await reconcileRole(session.userId).catch((error) => {
            // A role check must never block somebody signing in.
            console.error('[auth] could not reconcile role', error)
          })
          return { data: session }
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
