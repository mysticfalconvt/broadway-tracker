import { Avatar } from './Avatar'
import type { Attendee } from '../server/profile-functions'

/**
 * The people who were at a night, overlapping, with their photographs.
 *
 * The keys arrive already filtered: an avatar is served to its owner and to
 * approved friends only, and two people can be at the same night without being
 * friends here. Anything this could not show is null by the time it gets here,
 * so it falls back to initials rather than a broken image.
 *
 * The reader is "You" in the label and themselves in the circle — their own
 * face, or their own initials, not a Y.
 */
export function AvatarGroup({ people }: { people: Attendee[] }) {
  if (people.length === 0) return null
  const label = people.map((one) => (one.isViewer ? 'You' : one.name)).join(' · ')

  return (
    <div className="avatar-group" aria-label={`Attendees: ${label}`}>
      {people.slice(0, 4).map((one) => (
        <Avatar imageKey={one.imageKey} key={one.name} name={one.name} />
      ))}
      <span className="avatar-label">{label}</span>
    </div>
  )
}
