import { AvatarGroup } from './AvatarGroup'
import { Rating } from './Rating'
import { ShowArtwork } from './ShowArtwork'

type MemoryCardProps = {
  title: string
  type: string
  date: string
  venue: string
  city: string
  attendees: string[]
  rating?: number
  review?: string
}

export function MemoryCard({
  title,
  type,
  date,
  venue,
  city,
  attendees,
  rating,
  review,
}: MemoryCardProps) {
  return (
    <article className="memory-card">
      <ShowArtwork title={title} type={type} tone="oxblood" />
      <div className="memory-content">
        <p className="memory-date">{date}</p>
        <h3>{title}</h3>
        <p className="memory-place">
          {venue} · {city}
        </p>
        <AvatarGroup names={attendees} />
        <Rating value={rating} />
        {review ? <p className="memory-review">“{review}”</p> : null}
      </div>
    </article>
  )
}
