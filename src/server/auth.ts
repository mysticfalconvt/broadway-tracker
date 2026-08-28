import { createHash } from 'node:crypto'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { sendEmail } from './email'
import { getDb } from './db/client'
import * as schema from './db/schema'

function createHandle(email: string) {
  const localPart =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'theatregoer'
  const suffix = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8)
  return `${localPart.slice(0, 20) || 'theatregoer'}-${suffix}`
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
      handle: createHandle(coreFields.email),
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
      handle: { type: 'string', required: false, input: false },
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
        before: async (user) => ({ data: { ...user, handle: createHandle(user.email) } }),
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
