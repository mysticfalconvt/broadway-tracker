import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../server/auth'
import type { Actor } from '../../server/catalog-functions'
import { addShowPhoto, setAvatarForUser, setShowCover } from '../../server/image-functions'
import { InvalidImageError, MAX_IMAGE_BYTES } from '../../server/image-validation'

/**
 * Uploads pass through the application rather than going straight to storage:
 * the bucket is unreachable from a browser, so a presigned URL would address a
 * host the client cannot resolve. Everything is validated here from the bytes
 * themselves before a single object is written.
 */
export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        // Reject an oversized body before buffering it into memory.
        const declared = Number(request.headers.get('content-length') ?? 0)
        if (declared > MAX_IMAGE_BYTES * 1.1) {
          return Response.json({ error: 'That file is too large.' }, { status: 413 })
        }

        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return Response.json({ error: 'Expected a multipart upload.' }, { status: 400 })
        }

        const file = form.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'Attach a file to upload.' }, { status: 400 })
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return Response.json({ error: 'That file is too large.' }, { status: 413 })
        }
        const bytes = new Uint8Array(await file.arrayBuffer())
        const kind = String(form.get('kind') ?? '')

        try {
          if (kind === 'avatar') {
            return Response.json({ key: await setAvatarForUser(session.user.id, bytes) })
          }
          if (kind === 'show-photo') {
            const showId = String(form.get('showId') ?? '')
            if (!showId) return Response.json({ error: 'Choose a show.' }, { status: 400 })
            const requested = String(form.get('visibility') ?? 'private')
            const visibility =
              requested === 'public' ? 'public' : requested === 'friends' ? 'friends' : 'private'
            const photo = await addShowPhoto(session.user.id, showId, bytes, visibility)
            return Response.json({ key: photo.objectKey, id: photo.id })
          }
          if (kind === 'show-cover') {
            const showId = String(form.get('showId') ?? '')
            if (!showId) return Response.json({ error: 'Choose a show.' }, { status: 400 })
            const key = await setShowCover(session.user as Actor, showId, bytes)
            return Response.json({ key })
          }
          return Response.json({ error: 'Unknown upload kind.' }, { status: 400 })
        } catch (error) {
          if (error instanceof InvalidImageError) {
            return Response.json({ error: error.message }, { status: 422 })
          }
          const message = error instanceof Error ? error.message : 'Upload failed.'
          const status = message === 'Forbidden' ? 403 : 400
          return Response.json({ error: message }, { status })
        }
      },
    },
  },
})
