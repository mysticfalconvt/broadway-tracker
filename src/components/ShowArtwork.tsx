type ShowArtworkProps = {
  title: string
  type: string
  /** Storage key for the cover, if the catalog has one. */
  coverImageKey?: string | null
  tone?: 'midnight' | 'oxblood' | 'paper'
}

/**
 * Owns artwork fallback for the whole product: every other component may assume
 * a cover is missing. Covers live in private storage with no public URL, so the
 * key is resolved to the authorizing proxy route rather than a bucket address.
 */
export function ShowArtwork({ title, type, coverImageKey, tone = 'midnight' }: ShowArtworkProps) {
  if (coverImageKey) {
    return (
      <img
        className="show-artwork"
        src={`/api/images/${coverImageKey}`}
        alt={`${title} artwork`}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <div
      className={`show-artwork show-artwork-fallback show-artwork-${tone}`}
      aria-label={`${title} artwork unavailable`}
    >
      <span className="show-artwork-type">{type}</span>
      <strong>{title}</strong>
    </div>
  )
}
