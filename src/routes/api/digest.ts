import { createFileRoute } from '@tanstack/react-router'

import { sendDueDigests } from '../../server/digest-functions'

/**
 * The scheduled run, for a cron on the host to call.
 *
 * Guarded by a shared secret rather than a session, because nobody is signed in
 * at four in the morning. Without `DIGEST_SECRET` set the endpoint refuses
 * outright: an unguarded route that can send mail to every member is not
 * something to leave open by omission.
 *
 *   curl -X POST -H "authorization: Bearer $DIGEST_SECRET" \
 *     https://…/api/digest?dryRun=1
 */
export const Route = createFileRoute('/api/digest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DIGEST_SECRET
        if (!secret) {
          return Response.json({ error: 'Digests are not configured.' }, { status: 503 })
        }
        const offered = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        if (offered !== secret) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const dryRun = new URL(request.url).searchParams.get('dryRun') !== null
        return Response.json(await sendDueDigests({ dryRun }))
      },
    },
  },
})
