type AvatarGroupProps = { names: string[] }

export function AvatarGroup({ names }: AvatarGroupProps) {
  return (
    <div className="avatar-group" aria-label={`Attendees: ${names.join(', ')}`}>
      {names.slice(0, 4).map((name) => (
        <span key={name} className="avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      ))}
      <span className="avatar-label">{names.join(' · ')}</span>
    </div>
  )
}
