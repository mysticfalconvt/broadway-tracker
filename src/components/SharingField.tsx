import { useId, useState } from 'react'

import type { Visibility } from '../server/visibility'

const summaries: Record<Visibility, string> = {
  private: 'only you',
  friends: 'your friends',
  public: 'anyone',
}

/**
 * Who one thing is shared with, kept out of the way.
 *
 * Almost nobody wants to decide this per item — they decide it once, on their
 * profile, and everything follows. So the control starts folded away, showing
 * what will happen and where that came from, and opens only for the rare thing
 * somebody wants to treat differently.
 *
 * "Follow my profile" submits nothing at all, which is what makes it durable:
 * the server fills in the profile setting, and the item keeps following that
 * setting if it later changes. Choosing a level explicitly pins it there.
 */
export function SharingField({
  name,
  label,
  profileDefault,
  current,
  wording,
}: {
  name: string
  label: string
  profileDefault: Visibility
  /** The level already pinned on this item, if somebody chose one. */
  current?: Visibility | null
  /** Per-context words for each level, where "friends" means something narrower. */
  wording?: Partial<Record<Visibility, string>>
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const effective = current ?? profileDefault
  const words = { ...summaries, ...wording }

  return (
    <div className="sharing-field">
      <p className="sharing-summary">
        <span>
          {label}: <strong>{words[effective]}</strong>
          {current ? ' — set for this one' : ' — from your profile'}
        </span>
        <button className="text-action" onClick={() => setOpen((was) => !was)} type="button">
          {open ? 'Done' : 'Change'}
        </button>
      </p>
      {open ? (
        <label htmlFor={id}>
          <span className="sr-only">{label}</span>
          <select defaultValue={current ?? ''} id={id} name={name}>
            <option value="">Follow my profile ({words[profileDefault]})</option>
            <option value="private">{words.private}</option>
            <option value="friends">{words.friends}</option>
            <option value="public">{words.public}</option>
          </select>
        </label>
      ) : (
        // Keeps a pinned choice in the payload while the control is folded away,
        // so saving an unrelated field does not quietly unpin it.
        <input name={name} type="hidden" value={current ?? ''} />
      )}
    </div>
  )
}
