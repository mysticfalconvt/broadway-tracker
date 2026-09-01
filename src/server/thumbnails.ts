import { createServerOnlyFn } from '@tanstack/react-start'
import sharp from 'sharp'

import {
  type StoredImage,
  type ThumbnailWidth,
  getImage,
  putImage,
  thumbnailKeyFor,
} from './storage'

/**
 * A smaller copy of an image, made the first time one is asked for and kept.
 *
 * Three ways to do this and only one of them fits. Resizing on every request
 * repeats the same work for every visitor for the life of the picture. Making
 * every size at upload does work nobody may ever want, and leaves everything
 * uploaded before today without any — so it needs a backfill, and the backfill
 * is the part that goes wrong.
 *
 * Deriving on demand and storing the result costs one resize per size actually
 * looked at, ever. Photographs already in the bucket get thumbnails the first
 * time somebody opens the gallery, with nothing to migrate.
 *
 * WebP for the copies regardless of what came in: it is a third the size of the
 * JPEG at the same quality, and a copy nobody keeps the original of can afford
 * to be lossy.
 */
export const imageAtWidth = createServerOnlyFn(
  async (key: string, width: ThumbnailWidth): Promise<StoredImage | null> => {
    const derived = thumbnailKeyFor(key, width)

    const already = await getImage(derived)
    if (already) return already

    const original = await getImage(key)
    if (!original) return null

    const source = Buffer.from(await new Response(original.body).arrayBuffer())
    const resized = await sharp(source)
      // Phone photographs carry their orientation in EXIF rather than in the
      // pixels. Without this a picture taken sideways stays sideways, and the
      // rotation is lost entirely once the metadata is stripped below.
      .rotate()
      // Never upscale: a small original asked for at 1280 would be blown up
      // into something larger and worse than what it came from.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      // Location and camera data have no business being served to a gallery.
      .toBuffer()

    await putImage(derived, resized, 'image/webp')
    return (
      (await getImage(derived)) ?? {
        body: new Response(resized).body as ReadableStream,
        contentType: 'image/webp',
        contentLength: resized.byteLength,
      }
    )
  },
)
