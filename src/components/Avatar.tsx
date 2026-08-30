import { toneForTitle } from '../lib/artwork'

/** First and last initial: "Rosalind Vance" becomes RV, "Cher" becomes C. */
export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/**
 * Somebody's photograph, or their initials on a colour of their own.
 *
 * Most people never upload one, so the absence is the ordinary case and has to
 * look deliberate rather than broken. It borrows the show artwork palette and
 * the same stable hash, so the colour is drawn from the person's name: the same
 * person is the same colour on every visit, on every device, and on the server
 * and the client alike — which a random colour would fail at all three.
 *
 * Photographs are private, so a key is resolved through the authorizing proxy
 * rather than a bucket address, and never appears on the anonymous public pages.
 */
export function Avatar({
  name,
  imageKey,
  className = '',
}: {
  name: string
  imageKey?: string | null
  className?: string
}) {
  if (imageKey) {
    return <img alt="" className={`avatar ${className}`.trim()} src={`/api/images/${imageKey}`} />
  }
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-initials show-artwork-tone-${toneForTitle(name)} ${className}`.trim()}
    >
      {initialsFor(name)}
    </span>
  )
}
