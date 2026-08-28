type ShowArtworkProps = {
  title: string
  type: string
  imageUrl?: string | null
  tone?: 'midnight' | 'oxblood' | 'paper'
}

export function ShowArtwork({ title, type, imageUrl, tone = 'midnight' }: ShowArtworkProps) {
  if (imageUrl) {
    return <img className="show-artwork" src={imageUrl} alt={`${title} artwork`} />
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
