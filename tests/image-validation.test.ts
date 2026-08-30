import { describe, expect, it } from 'vitest'

import { InvalidImageError, MAX_IMAGE_BYTES, inspectImage } from '../src/server/image-validation'

function png(width: number, height: number, extra = 0) {
  const b = new Uint8Array(24 + extra)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  new DataView(b.buffer).setUint32(16, width)
  new DataView(b.buffer).setUint32(20, height)
  return b
}

function jpeg(width: number, height: number) {
  const b = new Uint8Array(20)
  b.set([0xff, 0xd8, 0xff], 0)
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 2) // SOF0, length 17, 8-bit
  b[7] = height >> 8
  b[8] = height & 0xff
  b[9] = width >> 8
  b[10] = width & 0xff
  return b
}

function webpVp8(width: number, height: number) {
  const b = new Uint8Array(32)
  b.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  b.set([0x56, 0x50, 0x38, 0x20], 12) // "VP8 "
  b[26] = width & 0xff
  b[27] = (width >> 8) & 0x3f
  b[28] = height & 0xff
  b[29] = (height >> 8) & 0x3f
  return b
}

describe('format sniffing', () => {
  it('identifies png, jpeg, and webp from their magic bytes', () => {
    expect(inspectImage(png(800, 600)).format).toBe('image/png')
    expect(inspectImage(jpeg(800, 600)).format).toBe('image/jpeg')
    expect(inspectImage(webpVp8(800, 600)).format).toBe('image/webp')
  })

  it('rejects a file that is not an image regardless of what it claims to be', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    expect(() => inspectImage(html)).toThrow(InvalidImageError)
    expect(() => inspectImage(html)).toThrow('Upload a PNG, JPEG, or WebP image.')
  })

  it('rejects an SVG, which can carry script', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(() => inspectImage(svg)).toThrow('Upload a PNG, JPEG, or WebP image.')
  })

  it('rejects a polyglot whose extension lies about its content', () => {
    // Real GIF bytes: a valid image, but not a format we accept.
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x20, 0x00])
    expect(() => inspectImage(gif)).toThrow('Upload a PNG, JPEG, or WebP image.')
  })

  it('rejects an empty file', () => {
    expect(() => inspectImage(new Uint8Array(0))).toThrow('That file is empty.')
  })
})

describe('dimension parsing', () => {
  it('reads png dimensions', () => {
    const info = inspectImage(png(1234, 567))
    expect(info.width).toBe(1234)
    expect(info.height).toBe(567)
  })

  it('reads jpeg dimensions from the start-of-frame marker', () => {
    const info = inspectImage(jpeg(640, 480))
    expect(info.width).toBe(640)
    expect(info.height).toBe(480)
  })

  it('reads lossy webp dimensions', () => {
    const info = inspectImage(webpVp8(320, 240))
    expect(info.width).toBe(320)
    expect(info.height).toBe(240)
  })

  it('reports the byte length it was given', () => {
    expect(inspectImage(png(800, 600, 100)).bytes).toBe(124)
  })
})

describe('limits', () => {
  it('rejects an image larger than the byte ceiling', () => {
    const huge = png(800, 600, MAX_IMAGE_BYTES)
    expect(() => inspectImage(huge)).toThrow('8MB or smaller')
  })

  it('rejects an image beyond the pixel ceiling', () => {
    expect(() => inspectImage(png(9000, 100))).toThrow('under 6000px')
    expect(() => inspectImage(png(100, 9000))).toThrow('under 6000px')
  })

  it('rejects a tracking-pixel sized image', () => {
    expect(() => inspectImage(png(1, 1))).toThrow('at least 32px')
  })

  it('treats a zero dimension as corrupt rather than tiny', () => {
    expect(() => inspectImage(png(0, 0))).toThrow('corrupt')
  })

  it('accepts an image exactly on the lower bound', () => {
    expect(inspectImage(png(32, 32)).width).toBe(32)
  })
})
