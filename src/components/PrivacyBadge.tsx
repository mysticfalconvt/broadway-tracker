import type { Visibility } from '../domain/visibility'

type PrivacyBadgeProps = { visibility: Visibility }

const labels: Record<Visibility, string> = {
  private: 'Only me',
  friends: 'Friends',
  public: 'Public',
}

const icons: Record<Visibility, string> = {
  private: '⌑',
  friends: '◉',
  public: '◎',
}

export function PrivacyBadge({ visibility }: PrivacyBadgeProps) {
  return (
    <span className="privacy-badge">
      {icons[visibility]} {labels[visibility]}
    </span>
  )
}
