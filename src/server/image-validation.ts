/**
 * Image checks that read the bytes themselves. A browser-supplied filename or
 * Content-Type is attacker-controlled, so neither is trusted: the format is
 * sniffed from magic bytes and the dimensions are parsed from the header. Doing
 * this without an image library keeps the upload path free of a decoder, which
 * is the part of an image pipeline most likely to carry a memory-safety bug.
 */
export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export type ImageInfo = { format: ImageFormat; width: number; height: number; bytes: number }

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 6000
export const MIN_IMAGE_DIMENSION = 32

export class InvalidImageError extends Error {}

function sniffFormat(buf: Uint8Array): ImageFormat | null {
  const at = (i: number) => buf[i]
  if (
    buf.length > 8 &&
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return 'image/png'
  }
  if (buf.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (
    buf.length > 12 &&
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function readU32BE(buf: Uint8Array, offset: number) {
  return (
    (((buf[offset] ?? 0) << 24) |
      ((buf[offset + 1] ?? 0) << 16) |
      ((buf[offset + 2] ?? 0) << 8) |
      (buf[offset + 3] ?? 0)) >>>
    0
  )
}

function pngSize(buf: Uint8Array) {
  // The IHDR chunk is required to be first, so width/height sit at a fixed offset.
  if (buf.length < 24) return null
  return { width: readU32BE(buf, 16), height: readU32BE(buf, 20) }
}

function jpegSize(buf: Uint8Array) {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = buf[i + 1] ?? 0
    // Start-of-frame markers carry the dimensions; the rest are skipped by length.
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    const length = ((buf[i + 2] ?? 0) << 8) | (buf[i + 3] ?? 0)
    if (isSof) {
      return {
        height: ((buf[i + 5] ?? 0) << 8) | (buf[i + 6] ?? 0),
        width: ((buf[i + 7] ?? 0) << 8) | (buf[i + 8] ?? 0),
      }
    }
    if (length <= 0) return null
    i += 2 + length
  }
  return null
}

function webpSize(buf: Uint8Array) {
  const chunk = String.fromCharCode(...buf.slice(12, 16))
  const u16 = (o: number) => ((buf[o + 1] ?? 0) << 8) | (buf[o] ?? 0)
  if (chunk === 'VP8 ' && buf.length > 30) {
    return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff }
  }
  if (chunk === 'VP8L' && buf.length > 25) {
    const bits =
      (buf[21] ?? 0) | ((buf[22] ?? 0) << 8) | ((buf[23] ?? 0) << 16) | ((buf[24] ?? 0) << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X' && buf.length > 30) {
    const u24 = (o: number) =>
      ((buf[o] ?? 0) | ((buf[o + 1] ?? 0) << 8) | ((buf[o + 2] ?? 0) << 16)) + 1
    return { width: u24(24), height: u24(27) }
  }
  return null
}

/** Validates an upload and returns what the bytes actually are. */
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length === 0) throw new InvalidImageError('That file is empty.')
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new InvalidImageError(
      `Images must be ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller.`,
    )
  }
  const format = sniffFormat(bytes)
  if (!format) throw new InvalidImageError('Upload a PNG, JPEG, or WebP image.')

  const size =
    format === 'image/png'
      ? pngSize(bytes)
      : format === 'image/jpeg'
        ? jpegSize(bytes)
        : webpSize(bytes)
  if (!size || !size.width || !size.height) {
    throw new InvalidImageError('That image appears to be corrupt.')
  }
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    throw new InvalidImageError(`Images must be under ${MAX_IMAGE_DIMENSION}px on each side.`)
  }
  if (size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION) {
    throw new InvalidImageError(`Images must be at least ${MIN_IMAGE_DIMENSION}px on each side.`)
  }
  return { format, width: size.width, height: size.height, bytes: bytes.length }
}

export const EXTENSIONS: Record<ImageFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
