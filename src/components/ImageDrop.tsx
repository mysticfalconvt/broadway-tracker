import { type ClipboardEvent, type DragEvent, type ReactNode, useRef, useState } from 'react'

/**
 * The first image in a clipboard or a drag, or nothing.
 *
 * A paste carries several representations of the same thing — an image, a
 * screenshot's HTML wrapper, a filename as text — so this takes the first that
 * is actually a file and ignores the rest.
 */
function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

/**
 * Somewhere to put a picture: choose one, drop one, or paste one.
 *
 * Choosing a file means knowing where the file is, which is the hard part for
 * anybody who just took a screenshot or copied an image out of a message. Paste
 * is the same gesture they already used to copy it.
 *
 * Paste is handled on this element rather than on the window, deliberately. The
 * admin production screen renders one of these per staging, and a window
 * listener would have every one of them answer the same paste — several
 * uploads, to several different records, from one keystroke. Focus decides
 * which one is listening, and the zone is focusable so that clicking it is
 * enough to choose.
 */
export function ImageDrop({
  onFile,
  busy = false,
  accept = 'image/png,image/jpeg,image/webp',
  children,
}: {
  onFile: (file: File) => void
  busy?: boolean
  accept?: string
  children: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (file: File | null) => {
    if (file && !busy) onFile(file)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the interactive
    // control is the file input inside; this only adds two more ways to reach
    // the same action, and is focusable so both are keyboard-reachable.
    <div
      className={`image-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
      onDragLeave={() => setOver(false)}
      onDragOver={(event: DragEvent) => {
        event.preventDefault()
        setOver(true)
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault()
        setOver(false)
        take(imageFrom(event.dataTransfer))
      }}
      onPaste={(event: ClipboardEvent) => {
        const file = imageFrom(event.clipboardData)
        // Only swallow the paste when it actually held a picture, so pasting
        // text into something nearby still behaves.
        if (file) {
          event.preventDefault()
          take(file)
        }
      }}
      tabIndex={0}
    >
      <input
        accept={accept}
        disabled={busy}
        onChange={(event) => {
          take(event.target.files?.[0] ?? null)
          // Cleared so choosing the same file twice still fires a change.
          if (inputRef.current) inputRef.current.value = ''
        }}
        ref={inputRef}
        type="file"
      />
      {children}
      <span className="image-drop-hint">
        {busy ? 'Uploading…' : 'or drop a picture here, or click here and paste one'}
      </span>
    </div>
  )
}
