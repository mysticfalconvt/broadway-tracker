import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { dropApiKey, issueApiKey, listMyApiKeys } from '../../server/api-keys'

export const Route = createFileRoute('/_protected/keys')({
  component: Keys,
  loader: async () => ({ keys: await listMyApiKeys() }),
})

function when(value: Date | string | null) {
  if (!value) return 'never used'
  return `used ${new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

function Keys() {
  const { keys } = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const living = keys.filter((key) => !key.revokedAt)

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Your agent</p>
        <h1>Keys</h1>
        <p>
          A key lets an assistant act as you — look things up, research a show, log a night. It can
          do what you can do here, and no more. Anything it adds to the catalog waits for review.
        </p>
      </header>

      <form
        className="key-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const made = await issueApiKey({ data: { name } })
            setFresh(made.token)
            setName('')
            await router.invalidate()
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'That key could not be made.')
          }
          setBusy(false)
        }}
      >
        <label>
          <span className="sr-only">What is this key for?</span>
          {/*
            `required` rather than a disabled button. A button that is dead for
            a reason the page does not give looks broken, and the browser
            already says "fill this in" at the moment somebody tries — which is
            the only moment it is worth saying.
          */}
          <input
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Laptop"
            required
            value={name}
          />
        </label>
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? 'Making…' : 'New key'}
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Shown once. Nothing here can recover it afterwards, which is the point. */}
      {fresh ? (
        <div className="key-fresh">
          <p>
            <strong>Copy this now.</strong> It will not be shown again.
          </p>
          <code>{fresh}</code>
          <p className="key-how">To use it from Claude Code:</p>
          <pre>
            {`claude mcp add --transport http broadway \\\n  ${typeof window === 'undefined' ? '' : window.location.origin}/api/mcp \\\n  --header "Authorization: Bearer ${fresh}"`}
          </pre>
        </div>
      ) : null}

      {living.length ? (
        <ul className="key-list">
          {living.map((key) => (
            <li key={key.id}>
              <div>
                <strong>{key.name}</strong>
                <span>
                  {key.prefix}… · {when(key.lastUsedAt)}
                </span>
              </div>
              <button
                className="text-action"
                onClick={async () => {
                  await dropApiKey({ data: { id: key.id } })
                  await router.invalidate()
                }}
                type="button"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">No keys yet.</p>
      )}
    </main>
  )
}
