import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'

import { authClient } from '../../lib/auth-client'
import { updateAccountSettings } from '../../server/auth-functions'

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

function profileVisibilityFrom(value: FormDataEntryValue | null) {
  if (value === 'friends') return 'friends' as const
  if (value === 'public') return 'public' as const
  return 'private' as const
}

export const Route = createFileRoute('/_protected/settings')({ component: Settings })

function Settings() {
  const { user } = Route.useRouteContext()
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
      await updateAccountSettings({
        data: {
          name: String(form.get('name')),
          handle: String(form.get('handle')),
          profileVisibility: profileVisibilityFrom(form.get('profileVisibility')),
        },
      })
      setMessage('Settings saved.')
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
          <legend>Default profile visibility</legend>
          <label>
            <input
              type="radio"
              name="profileVisibility"
              value="private"
              defaultChecked={
                user.profileVisibility !== 'friends' && user.profileVisibility !== 'public'
              }
            />
            <span>
              <strong>Only me</strong>
              Keep new profile details private by default.
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
              Share profile details with approved friends.
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
              Publish an anonymous page of whatever you mark public. It carries no name and no
              handle — only the shows.
            </span>
          </label>
        </fieldset>
        <p className="settings-note">
          Your photo is stored privately and is only ever shown to you and to approved friends.
          Public pages stay anonymous and never display it.
        </p>
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
