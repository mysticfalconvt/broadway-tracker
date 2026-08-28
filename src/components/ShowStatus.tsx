import type { LibraryStatus } from '../domain/visibility'

type ShowStatusProps = { status: LibraryStatus; favorite?: boolean }

export function ShowStatus({ status, favorite = false }: ShowStatusProps) {
  return (
    <div className="status-group">
      <span className={`status-badge status-${status}`}>
        {status === 'seen' ? '✓ Seen' : '⌑ Want to see'}
      </span>
      {favorite ? <span className="status-badge status-favorite">♥ Favorite</span> : null}
    </div>
  )
}
