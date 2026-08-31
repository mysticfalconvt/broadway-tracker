import { Avatar } from './Avatar'

type AvatarGroupProps = { names: string[] }

/**
 * The people who were at a night, overlapping.
 *
 * Uses `Avatar` rather than rolling its own circle, which is what it used to
 * do: a bare `<span class="avatar">` holding one letter, with no tone colour
 * and none of the centring that lives on `.avatar-initials`. The letter landed
 * in the top-left corner and was clipped away by the border radius, so it read
 * as an empty dark disc — which is exactly what somebody reported seeing.
 */
export function AvatarGroup({ names }: AvatarGroupProps) {
  return (
    <div className="avatar-group" aria-label={`Attendees: ${names.join(', ')}`}>
      {names.slice(0, 4).map((name) => (
        <Avatar key={name} name={name} />
      ))}
      <span className="avatar-label">{names.join(' · ')}</span>
    </div>
  )
}
