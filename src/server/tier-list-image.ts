import { and, asc, eq } from 'drizzle-orm'
import { createServerOnlyFn } from '@tanstack/react-start'

import { getDb } from './db/client'
import { listItems, lists, shows } from './db/schema'
import { applyViewerCovers } from './image-functions'
import { toneForTitle } from '../lib/artwork'
import { TIER_LABELS } from '../lib/tier-list'
import { getImage } from './storage'

type Sharp = typeof import('sharp')['default']
let sharpLoader: Promise<Sharp | null> | undefined
async function sharp(): Promise<Sharp | null> {
  sharpLoader ??= import('sharp')
    .then((module) => module.default)
    .catch((error) => {
      console.error('[tier-list] sharp is unavailable', error)
      return null
    })
  return sharpLoader
}

function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ??
      character,
  )
}

/** Produces an immediate download, never a stored or shareable image URL. */
export const tierListImageForOwner = createServerOnlyFn(async (ownerId: string, listId: string) => {
  const [list] = await getDb()
    .select({ id: lists.id, title: lists.title, kind: lists.kind, tierNames: lists.tierNames })
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, ownerId)))
    .limit(1)
  if (!list || list.kind !== 'tier_list') throw new Error('Tier list not found')
  const renderer = await sharp()
  if (!renderer) throw new Error('Image downloads are unavailable on this server.')
  const items = await applyViewerCovers(
    ownerId,
    await getDb()
      .select({
        showId: shows.id,
        title: shows.title,
        type: shows.type,
        coverImageKey: shows.coverImageKey,
        tier: listItems.tier,
        position: listItems.position,
      })
      .from(listItems)
      .innerJoin(shows, eq(listItems.showId, shows.id))
      .where(eq(listItems.listId, list.id))
      .orderBy(asc(listItems.position)),
    (item) => item.showId,
  )
  const width = 1600
  const rowHeight = 210
  const height = 150 + rowHeight * TIER_LABELS.length
  const colors = ['#b84242', '#cf6c35', '#b9942b', '#4b8a5f', '#477f9c']
  const artworkColors = ['#17202b', '#25303b', '#7a2633', '#591b26', '#a4814f', '#39735c']
  const cards = TIER_LABELS.flatMap((tier, row) =>
    items
      .filter((item) => item.tier === tier)
      .slice(0, 10)
      .map((item, index) => ({ ...item, row, x: 135 + index * 142, y: 166 + row * rowHeight })),
  )
  const rows = TIER_LABELS.map((tier, row) => {
    const cardMarkup = cards
      .filter((card) => card.row === row)
      .map((card) => {
        const title = escapeXml(
          card.title.length > 20 ? `${card.title.slice(0, 19)}...` : card.title,
        )
        const fallback = artworkColors[toneForTitle(card.title)] ?? artworkColors[0]
        return `<rect x="${card.x}" y="${card.y}" width="124" height="178" rx="8" fill="#fffdf8"/><rect x="${card.x}" y="${card.y}" width="124" height="140" rx="8" fill="${fallback}"/><text x="${card.x + 10}" y="${card.y + 160}" fill="#201e1d" font-family="Arial, sans-serif" font-size="16">${title}</text>`
      })
      .join('')
    return `<rect x="0" y="${150 + row * rowHeight}" width="120" height="${rowHeight - 2}" fill="${colors[row]}"/><text x="60" y="${275 + row * rowHeight}" text-anchor="middle" fill="#fffdf8" font-family="Georgia, serif" font-size="62" font-weight="bold">${escapeXml(list.tierNames[tier])}</text>${cardMarkup}`
  }).join('')
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f7f3ea"/><text x="64" y="88" fill="#201e1d" font-family="Georgia, serif" font-size="52" font-weight="bold">${escapeXml(list.title)}</text><text x="66" y="122" fill="#6e6862" font-family="Arial, sans-serif" font-size="20">My Broadway Tracker tier list</text>${rows}</svg>`
  const covers = await Promise.all(
    cards.map(async (card) => {
      if (!card.coverImageKey) return null
      try {
        const stored = await getImage(card.coverImageKey)
        if (!stored) return null
        const source = Buffer.from(await new Response(stored.body).arrayBuffer())
        return {
          input: await renderer(source)
            .resize({ width: 124, height: 140, fit: 'cover', position: 'centre' })
            .png()
            .toBuffer(),
          left: card.x,
          top: card.y,
        }
      } catch (error) {
        // A broken catalog image should not make somebody's whole export fail.
        console.error('[tier-list] unable to include cover artwork', error)
        return null
      }
    }),
  )
  return renderer(Buffer.from(svg))
    .composite(covers.filter((cover): cover is NonNullable<typeof cover> => cover !== null))
    .png()
    .toBuffer()
})
