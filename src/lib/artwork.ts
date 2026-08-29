/**
 * Generated artwork for a show that has no photograph.
 *
 * The palette is chosen from a curated set rather than from a random hue, so
 * every result stays inside the Collected Nights palette and none of them can
 * come out ugly. The choice is derived from the show's own title, which makes it
 * stable: the same show looks the same on every visit and on every device, and
 * the server and the browser always agree. A cover picked at random would fail
 * both of those.
 */
export const ARTWORK_TONES = 6

/** A small, stable, well-distributed hash. Not for security. */
export function toneForTitle(title: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % ARTWORK_TONES
}
