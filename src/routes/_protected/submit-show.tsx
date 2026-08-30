import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { submitShow } from '../../server/catalog-functions'

export const Route = createFileRoute('/_protected/submit-show')({ component: SubmitShow })

function SubmitShow() {
  const [error, setError] = useState<string | null>(null)
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title'))
    setError(null)
    setIsPending(true)
    try {
      await submitShow({
        data: {
          title,
          type:
            form.get('type') === 'play'
              ? 'play'
              : form.get('type') === 'other'
                ? 'other'
                : 'musical',
          synopsis: String(form.get('synopsis')).trim() || undefined,
        },
      })
      setSubmittedTitle(title)
      event.currentTarget.reset()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not submit this show.',
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="submission-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Grow the shared archive</p>
        <h1>Add a missing show.</h1>
        <p>Reviewed before it appears in the catalog.</p>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <label>
          Show title
          <input name="title" maxLength={200} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue="musical">
            <option value="musical">Musical</option>
            <option value="play">Play</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          What is it about? <span>Optional</span>
          <textarea name="synopsis" maxLength={5000} rows={6} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {submittedTitle ? (
          <p className="auth-message" role="status">
            {submittedTitle} is waiting for review. Thank you for helping build the archive.
          </p>
        ) : null}
        <div className="settings-actions">
          <button className="button button-primary" type="submit" disabled={isPending}>
            {isPending ? 'Submitting...' : 'Submit for review'}
          </button>
          <Link className="button button-quiet" to="/discover">
            Return to search
          </Link>
        </div>
      </form>
    </main>
  )
}
