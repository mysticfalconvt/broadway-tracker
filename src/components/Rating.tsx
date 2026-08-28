type RatingProps = {
  value?: number | null
  size?: 'small' | 'default'
}

export function Rating({ value, size = 'default' }: RatingProps) {
  if (!value) return <span className={`rating rating-${size}`}>Not rated</span>

  const fullStars = Math.floor(value)
  const hasHalfStar = value % 1 >= 0.5
  const stars = `${'★'.repeat(fullStars)}${hasHalfStar ? '½' : ''}${'☆'.repeat(5 - fullStars - (hasHalfStar ? 1 : 0))}`

  return (
    <span className={`rating rating-${size}`} aria-label={`${value} out of 5 stars`}>
      <span aria-hidden="true">{stars}</span>
      <span className="sr-only">{value} out of 5 stars</span>
    </span>
  )
}
