import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../../server/auth'
import { canViewImage } from '../../../server/image-functions'
import {
  THUMBNAIL_WIDTHS,
  type ThumbnailWidth,
  getImage,
  isValidObjectKey,
} from '../../../server/storage'
import { imageAtWidth } from '../../../server/thumbnails'

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
        // Always the key as asked for, which is always an original: a resized
        // copy is addressed by its original plus a width, never by its own
        // name, so there is one thing to authorize and no way to reach a copy
        // of something you may not see.
        if (!(await canViewImage(viewerId, key))) {
          return new Response('Not found', { status: 404 })
        }

        const asked = Number(new URL(request.url).searchParams.get('w'))
        const width = THUMBNAIL_WIDTHS.find((allowed) => allowed === asked) as
          | ThumbnailWidth
          | undefined
        // An unrecognised width serves the original rather than refusing: a
        // picture at the wrong size is better than a broken one, and it keeps
        // the set of stored copies closed.
        const stored = width ? await imageAtWidth(key, width) : await getImage(key)
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
