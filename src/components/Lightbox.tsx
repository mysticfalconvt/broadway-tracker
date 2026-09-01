import { useCallback, useEffect, useRef } from 'react'

export type Framed = { id: string; objectKey: string; caption: string | null }

/**
 * One photograph, filling the screen, with the rest a keypress away.
 *
 * A gallery of thumbnails is a contact sheet: it tells you a photograph exists
 * without letting you look at it. This is the looking.
 *
 * Keyboard first, because it is the only way through a long set that does not
 * involve aiming at arrows: Escape closes, left and right move. Focus goes to
 * the close button on opening and returns to whatever was clicked on the way
 * out, so leaving does not drop somebody back at the top of the page.
 */
export function Lightbox({
  photos,
  index,
  onClose,
  onMove,
}: {
  photos: Framed[]
  index: number
  onClose: () => void
  onMove: (next: number) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<Element | null>(null)
  const photo = photos[index]

  const move = useCallback(
    (by: number) => {
      // Wraps, so the end of a set is not a dead end.
      onMove((index + by + photos.length) % photos.length)
    },
    [index, photos.length, onMove],
  )

  useEffect(() => {
    returnTo.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll while this is over it.
    const had = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = had
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus()
    }
  }, [move, onClose])

  if (!photo) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop closing
    // on click is a convenience; Escape and the close button are the real
    // controls and both are keyboard-reachable.
    <div
      aria-label="Photograph"
      aria-modal="true"
      className="lightbox"
      onClick={(event) => {
        // Only the backdrop itself, so a click on the picture does not close it.
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="lightbox-bar">
        <span>
          {index + 1} of {photos.length}
        </span>
        <button className="lightbox-close" onClick={onClose} ref={closeRef} type="button">
          Close
        </button>
      </div>

      <img
        alt={photo.caption ?? ''}
        className="lightbox-image"
        src={`/api/images/${photo.objectKey}`}
      />

      {photos.length > 1 ? (
        <>
          <button
            aria-label="Previous photograph"
            className="lightbox-step is-prev"
            onClick={() => move(-1)}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="Next photograph"
            className="lightbox-step is-next"
            onClick={() => move(1)}
            type="button"
          >
            ›
          </button>
        </>
      ) : null}

      {photo.caption ? <p className="lightbox-caption">{photo.caption}</p> : null}
    </div>
  )
}
