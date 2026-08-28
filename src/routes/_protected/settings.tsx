import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { authClient } from '../../lib/auth-client'
import { updateAccountSettings } from '../../server/auth-functions'

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
          profileVisibility: form.get('profileVisibility') === 'friends' ? 'friends' : 'private',
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
        <fieldset>
          <legend>Default profile visibility</legend>
          <label>
            <input
              type="radio"
              name="profileVisibility"
              value="private"
              defaultChecked={user.profileVisibility !== 'friends'}
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
        </fieldset>
        <p className="settings-note">
          Profile photo uploads will use your private RustFS storage once enabled.
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
