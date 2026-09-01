import { describe, expect, it } from 'vitest'

import { THUMBNAIL_WIDTHS, isValidObjectKey, thumbnailKeyFor } from '../src/server/storage'

const KEY = 'show-photos/b3712803-254b-4305-b30b-213245108c82.png'

describe('where a resized copy lives', () => {
  it('sits beside its original, under the same prefix', () => {
    // The prefix is what the authorization check reads, so a copy must keep it.
    expect(thumbnailKeyFor(KEY, 320)).toBe(
      'show-photos/b3712803-254b-4305-b30b-213245108c82@320.webp',
    )
  })

  it('is a key the proxy will serve', () => {
    for (const width of THUMBNAIL_WIDTHS) {
      expect(isValidObjectKey(thumbnailKeyFor(KEY, width))).toBe(true)
    }
  })

  it('refuses a width nobody offered', () => {
    // A number from a query string would be one request per pixel filling the
    // bucket with near-identical copies.
    expect(isValidObjectKey('show-photos/b3712803-254b-4305-b30b-213245108c82@999.webp')).toBe(
      false,
    )
    expect(isValidObjectKey('show-photos/b3712803-254b-4305-b30b-213245108c82@0.webp')).toBe(false)
  })

  it('still refuses everything it refused before', () => {
    expect(isValidObjectKey('show-photos/../etc.png')).toBe(false)
    expect(isValidObjectKey('secrets/b3712803-254b-4305-b30b-213245108c82.png')).toBe(false)
    expect(isValidObjectKey('show-photos/not-a-uuid.png')).toBe(false)
    expect(isValidObjectKey(KEY)).toBe(true)
  })

  it('does not turn a copy into a second original', () => {
    // Resizing a resized key would make @320@320, and the pattern refuses it —
    // so a copy can never become the source of another.
    const once = thumbnailKeyFor(KEY, 320)
    expect(isValidObjectKey(thumbnailKeyFor(once, 640))).toBe(false)
  })
})
