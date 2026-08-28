import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../../server/auth'
import { canViewImage } from '../../../server/image-functions'
import { getImage, isValidObjectKey } from '../../../server/storage'

/**
 * The storage bucket has no public access and is unreachable from a browser, so
 * every image is served through here after an authorization check. A refused or
 * missing object answers 404 alike, so the response never reveals that a key
 * exists but is not yours.
 */
export const Route = createFileRoute('/api/images/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const key = (params as { _splat?: string })._splat ?? ''
        if (!isValidObjectKey(key)) return new Response('Not found', { status: 404 })

        const session = await auth.api.getSession({ headers: request.headers })
        const viewerId = session?.user.id ?? null
        if (!(await canViewImage(viewerId, key))) {
          return new Response('Not found', { status: 404 })
        }

        const stored = await getImage(key)
        if (!stored) return new Response('Not found', { status: 404 })

        // Keys are content-addressed by a fresh uuid on every replacement, so an
        // object at a given key never changes and may be cached hard. Avatars
        // still stay out of shared caches because they are viewer-dependent.
        const isPublic = key.startsWith('shows/')
        const headers = new Headers({
          'content-type': stored.contentType,
          'cache-control': isPublic
            ? 'public, max-age=31536000, immutable'
            : 'private, max-age=300',
          'x-content-type-options': 'nosniff',
          vary: 'cookie',
        })
        if (stored.etag) headers.set('etag', stored.etag)
        if (stored.contentLength !== undefined) {
          headers.set('content-length', String(stored.contentLength))
        }
        if (stored.etag && request.headers.get('if-none-match') === stored.etag) {
          return new Response(null, { status: 304, headers })
        }
        return new Response(stored.body, { headers })
      },
    },
  },
})
