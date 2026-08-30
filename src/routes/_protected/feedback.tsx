import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { getMyReports, submitReport } from '../../server/report-functions'

export const Route = createFileRoute('/_protected/feedback')({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  loader: async () => ({ mine: await getMyReports() }),
  component: Feedback,
})

function Feedback() {
  const { from } = Route.useSearch()
  const { mine } = Route.useLoaderData()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)
    try {
      await submitReport({
        data: {
          kind: form.get('kind') === 'idea' ? 'idea' : 'bug',
          message: String(form.get('message')),
          path: from,
        },
      })
      setSent(true)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not send that. Try again.',
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="settings-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Tell us</p>
        <h1>Something broken, or something missing?</h1>
        <p>
          This goes straight to whoever looks after Broadway Tracker. Small things are worth sending
          — they are usually the quickest to fix.
        </p>
      </header>

      {sent ? (
        <section>
          <p className="auth-message" role="status">
            Sent. Thank you — that genuinely helps.
          </p>
          <Link className="button button-primary" to="/">
            Back to your theatre
          </Link>
        </section>
      ) : (
        <form className="settings-form" onSubmit={submit}>
          <fieldset>
            <legend>What kind of note is this?</legend>
            <label>
              <input type="radio" name="kind" value="bug" defaultChecked />
              <span>
                <strong>Something is broken</strong>A page, a button, or a number that looks wrong.
              </span>
            </label>
            <label>
              <input type="radio" name="kind" value="idea" />
              <span>
                <strong>Something is missing</strong>
                An idea, or a thing you wish it did.
              </span>
            </label>
          </fieldset>
          <label>
            Tell us about it
            <textarea
              name="message"
              rows={6}
              required
              minLength={5}
              placeholder="What were you doing, and what happened?"
            />
          </label>
          {from ? <p className="settings-note">Sent from {from}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="settings-actions">
            <button className="button button-primary" type="submit" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
      {mine.length ? (
        <section className="past-reports">
          <div className="section-heading">
            <div>
              <p className="eyebrow">What you have sent</p>
              <h2>Your reports.</h2>
            </div>
          </div>
          <ul className="report-list">
            {mine.map((report) => (
              <li data-resolved={report.status === 'resolved'} key={report.id}>
                <div className="report-head">
                  <span className={`report-kind report-kind-${report.kind}`}>
                    {report.kind === 'bug' ? 'Bug' : 'Idea'}
                  </span>
                  {report.status === 'resolved' ? (
                    <span className="report-kind report-kind-resolved">Resolved</span>
                  ) : null}
                  <span className="provenance">
                    {new Date(report.createdAt).toISOString().slice(0, 10)}
                    {report.path ? ` · ${report.path}` : ''}
                  </span>
                </div>
                <p className="report-message">{report.message}</p>
                {report.replies.length ? (
                  <ul className="report-replies">
                    {report.replies.map((reply) => (
                      <li key={reply.id}>
                        <span className="provenance">
                          {reply.authorName ?? 'An administrator'} ·{' '}
                          {new Date(reply.createdAt).toISOString().slice(0, 10)}
                        </span>
                        <p>{reply.message}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="outing-empty">No reply yet.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
