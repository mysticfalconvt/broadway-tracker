import { createFileRoute } from '@tanstack/react-router'

import { requireSession } from '../../../server/session'
import { listForViewer } from '../../../server/list-functions'
import { tierListImageForOwner } from '../../../server/tier-list-image'

export const Route = createFileRoute('/api/tier-lists/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const owner = (await requireSession()).user
        const list = await listForViewer(owner.id, params.id).catch(() => null)
        if (!list || !list.canEdit || list.kind !== 'tier_list')
          return new Response('Not found', { status: 404 })
        const image = await tierListImageForOwner(owner.id, list.id)
        return new Response(image, {
          headers: {
            'content-type': 'image/png',
            'content-disposition': 'attachment; filename="tier-list.png"',
            'cache-control': 'private, no-store',
          },
        })
      },
    },
  },
})
