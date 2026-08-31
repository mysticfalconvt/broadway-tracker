import type { Attendee } from '../server/profile-functions'
import { AvatarGroup } from './AvatarGroup'
import { Rating } from './Rating'
import { ShowArtwork } from './ShowArtwork'

type MemoryCardProps = {
  title: string
  type: string
  date: string
  venue?: string | null
  city?: string | null
  attendees: Attendee[]
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
  const place = [venue, city].filter(Boolean).join(' · ')
  return (
    <article className="memory-card">
      <ShowArtwork title={title} type={type} tone="oxblood" />
      <div className="memory-content">
        <p className="memory-date">{date}</p>
        <h3>{title}</h3>
        {/* A backfilled memory often has no venue. Let the type carry the space
            rather than leaving a dangling separator. */}
        {place ? <p className="memory-place">{place}</p> : null}
        <AvatarGroup people={attendees} />
        {rating === undefined ? null : <Rating value={rating} />}
        {review ? <p className="memory-review">“{review}”</p> : null}
      </div>
    </article>
  )
}
