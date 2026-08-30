import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'

import { authClient } from '../../lib/auth-client'
import { getSharingImpact, updateAccountSettings } from '../../server/auth-functions'

/**
 * Uploads go through the application because the storage bucket is unreachable
 * from a browser. The preview reads back through the same authorizing proxy
 * that will serve the image everywhere else.
 */
function AvatarField({ currentKey }: { currentKey?: string | null }) {
  const [key, setKey] = useState(currentKey ?? null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setProblem(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.set('kind', 'avatar')
      body.set('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body })
      const payload = (await response.json()) as { key?: string; error?: string }
      if (!response.ok || !payload.key) throw new Error(payload.error ?? 'Upload failed.')
      // Cache-bust the preview: the key changes on every replacement anyway.
      setKey(payload.key)
    } catch (caughtError) {
      setProblem(caughtError instanceof Error ? caughtError.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="avatar-field">
      <span className="avatar-field-label">Profile photo</span>
      <div className="avatar-field-row">
        {key ? (
          <img className="avatar-preview" src={`/api/images/${key}`} alt="Your profile photo" />
        ) : (
          <span className="avatar-preview avatar-preview-empty" aria-hidden="true">
            ◎
          </span>
        )}
        <div>
          <label className="avatar-field-input">
            <span>{key ? 'Replace photo' : 'Choose a photo'}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
            />
          </label>
          <p className="settings-note">PNG, JPEG, or WebP. Up to 8MB.</p>
        </div>
      </div>
      {busy ? <p className="settings-note">Uploading…</p> : null}
      {problem ? (
        <p className="form-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

/** "2 shows, 1 night out" — so the number is not the only thing on offer. */
function describeImpact(counts: {
  shows: number
  lists: number
  outings: number
  reviews: number
}) {
  const parts: string[] = []
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  add(counts.shows, 'show', 'shows')
  add(counts.outings, 'night out', 'nights out')
  add(counts.lists, 'list', 'lists')
  add(counts.reviews, 'review', 'reviews')
  return parts.join(', ')
}

function cadenceFrom(value: FormDataEntryValue | null) {
  if (value === 'monthly') return 'monthly' as const
  if (value === 'off') return 'off' as const
  return 'weekly' as const
}

function profileVisibilityFrom(value: FormDataEntryValue | null) {
  if (value === 'friends') return 'friends' as const
  if (value === 'public') return 'public' as const
  return 'private' as const
}

export const Route = createFileRoute('/_protected/settings')({
  loader: async () => ({ impact: await getSharingImpact() }),
  component: Settings,
})

function Settings() {
  const { user } = Route.useRouteContext()
  const { impact } = Route.useLoaderData()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setMessage(null)
    setIsPending(true)

    try {
      const result = await updateAccountSettings({
        data: {
          name: String(form.get('name')),
          handle: String(form.get('handle')),
          profileVisibility: profileVisibilityFrom(form.get('profileVisibility')),
          digestCadence: cadenceFrom(form.get('digestCadence')),
        },
      })
      const moved = result?.sharing?.moved
      setMessage(
        moved && moved.total > 0
          ? `Settings saved. ${moved.total} ${moved.total === 1 ? 'thing' : 'things'} moved with it: ${describeImpact(moved)}.`
          : 'Settings saved.',
      )
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not save your settings.',
      )
    } finally {
      setIsPending(false)
    }
  }

  async function signOut() {
    await authClient.signOut()
    window.location.assign('/sign-in')
  }

  return (
    <main className="settings-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Account settings</p>
        <h1>Make the collection yours.</h1>
        <p>Choose the name and privacy defaults that travel with your theatre journal.</p>
      </header>

      <form className="settings-form" onSubmit={saveSettings}>
        <label>
          Display name
          <input name="name" autoComplete="name" defaultValue={user.name} required />
        </label>
        <label>
          Handle
          <input
            name="handle"
            defaultValue={user.handle ?? ''}
            pattern="[a-z0-9][a-z0-9-]{2,29}"
            required
          />
          <span>Used when friends look for you. Lowercase letters, numbers, and hyphens only.</span>
        </label>
        <AvatarField currentKey={user.image} />
        <fieldset>
          <legend>Letters</legend>
          <p className="settings-note settings-sharing-lede">
            Only ever sent if you have been away, and only if there is something in it.
          </p>
          <label>
            <input
              defaultChecked={user.digestCadence === 'weekly'}
              name="digestCadence"
              type="radio"
              value="weekly"
            />
            <span>
              <strong>Weekly</strong>
              Anniversaries, anything written, where friends have been.
            </span>
          </label>
          <label>
            <input
              defaultChecked={user.digestCadence === 'monthly'}
              name="digestCadence"
              type="radio"
              value="monthly"
            />
            <span>
              <strong>Monthly</strong>
              Less often, and fuller.
            </span>
          </label>
          <label>
            <input
              defaultChecked={user.digestCadence === 'off'}
              name="digestCadence"
              type="radio"
              value="off"
            />
            <span>
              <strong>Never</strong>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Who your theatre is for</legend>
          <p className="settings-note settings-sharing-lede">
            Changing this moves everything that follows it. Anything set on its own stays put.
          </p>
          <label>
            <input
              type="radio"
              name="profileVisibility"
              value="private"
              defaultChecked={user.profileVisibility === 'private'}
            />
            <span>
              <strong>Only me</strong>
              Nobody else sees your theatre.
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="profileVisibility"
              value="friends"
              defaultChecked={user.profileVisibility === 'friends'}
            />
            <span>
              <strong>Friends</strong>
              Approved friends see your shows, your nights, and your lists.
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="profileVisibility"
              value="public"
              defaultChecked={user.profileVisibility === 'public'}
            />
            <span>
              <strong>Public</strong>
              An anonymous page of whatever you mark public. No name, no handle.
            </span>
          </label>
        </fieldset>
        {impact && impact.total > 0 ? (
          <p className="settings-note">
            {impact.total} {impact.total === 1 ? 'thing' : 'things'} follow this setting:{' '}
            {describeImpact(impact)}.
          </p>
        ) : null}
        <p className="settings-note">Your photo is only ever shown to approved friends.</p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="settings-actions">
          <button className="button button-primary" type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save settings'}
          </button>
          <button className="button button-quiet" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </form>
    </main>
  )
}
