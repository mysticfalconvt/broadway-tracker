import { createServerFn } from '@tanstack/react-start'

/**
 * Which social providers this deployment has credentials for.
 *
 * `auth.ts` registers Google only when both the client id and secret are
 * present, so the button has to be told the same thing. Offering a sign-in
 * route that is not wired up produces a confusing failure instead of an honest
 * absence, and the credentials themselves never reach the browser — only
 * whether they exist.
 */
export const getSocialProviders = createServerFn({ method: 'GET' }).handler(async () => ({
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
}))
