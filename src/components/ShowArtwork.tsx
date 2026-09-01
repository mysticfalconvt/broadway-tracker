import { toneForTitle } from '../lib/artwork'

type ShowArtworkProps = {
  title: string
  type: string
  /** Storage key for the cover, if the catalog has one. */
  coverImageKey?: string | null
  /** Overrides the generated tone where a section needs a particular mood. */
  tone?: 'midnight' | 'oxblood' | 'paper'
  /**
   * Which stored size to ask for. A card wants a card-sized copy; a hero wants
   * a hero-sized one. Defaults to the card, because most of these are cards.
   */
  width?: 128 | 320 | 640 | 1280
}

/**
 * Owns artwork fallback for the whole product: every other component may assume
 * a cover is missing. Covers live in private storage with no public URL, so the
 * key is resolved to the authorizing proxy route rather than a bucket address.
 */
export function ShowArtwork({ title, type, coverImageKey, tone, width = 640 }: ShowArtworkProps) {
  if (coverImageKey) {
    return (
      <img
        className="show-artwork"
        src={`/api/images/${coverImageKey}?w=${width}`}
        alt={`${title} artwork`}
        loading="lazy"
        decoding="async"
      />
    )
  }

  // Without a photograph the show gets generated artwork keyed off its own
  // title, so it is recognisable and consistent rather than a blank block.
  const generated = `show-artwork-tone-${toneForTitle(title)}`
  return (
    <div
      className={`show-artwork show-artwork-fallback ${tone ? `show-artwork-${tone}` : generated}`}
      aria-label={`${title} artwork unavailable`}
    >
      <span className="show-artwork-mark" aria-hidden="true" />
      <span className="show-artwork-type">{type}</span>
      <strong>{title}</strong>
    </div>
  )
}
