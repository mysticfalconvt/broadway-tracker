import { Link, createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { type Answer, ask } from '../../server/ask-functions'
import { createOuting } from '../../server/outing-functions'

export const Route = createFileRoute('/_protected/ask')({ component: Ask })

type Exchange = { question: string; answer: Answer }

function Ask() {
  const [history, setHistory] = useState<Exchange[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const asked = question.trim()
    if (!asked) return
    setBusy(true)
    setError(null)
    try {
      const answer = await ask({ data: { question: asked } })
      setHistory((previous) => [...previous, { question: asked, answer }])
      setQuestion('')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'That did not work. The model may not be running.',
      )
    }
    setBusy(false)
  }

  return (
    <main className="page-wrap ask-page">
      <header className="settings-header">
        <p className="eyebrow">Work it out</p>
        <h1>When did I see that?</h1>
        <p>Say what you remember. The answers come from the catalog, not from a model’s memory.</p>
      </header>

      {history.map((exchange) => (
        <section className="exchange" key={exchange.question}>
          <p className="exchange-question">{exchange.question}</p>
          <div className="exchange-answer">
            <p>{exchange.answer.say}</p>
            {exchange.answer.proposal ? <Confirm proposal={exchange.answer.proposal} /> : null}
            {/* What it looked at, so the reasoning can be judged rather than trusted. */}
            <details className="exchange-working">
              <summary>What it looked up</summary>
              <ul>
                {exchange.answer.steps.map((step) => (
                  <li key={`${step.tool}-${step.summary}`}>
                    <strong>{step.tool}</strong> {step.summary}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      ))}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="ask-form" onSubmit={send}>
        <label>
          <span className="sr-only">What do you remember?</span>
          <textarea
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="I saw The Producers around 2003, Tony Danza was in it…"
            rows={3}
            value={question}
          />
        </label>
        <button className="button button-primary" disabled={busy || !question.trim()} type="submit">
          {busy ? 'Looking…' : 'Ask'}
        </button>
      </form>
    </main>
  )
}

/**
 * The one place any of this writes anything, and only when somebody says so.
 *
 * It goes through the same `createOuting` the form uses, so a conversation can
 * never record something a person could not have recorded themselves.
 */
function Confirm({ proposal }: { proposal: NonNullable<Answer['proposal']> }) {
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (saved) {
    return (
      <p className="exchange-saved">
        Logged.{' '}
        <Link params={{ id: saved }} to="/outings/$id">
          Have a look
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="proposal">
      <p className="proposal-what">
        <strong>{proposal.showTitle}</strong>
        {proposal.occurredYear ? ` · ${proposal.occurredYear}` : ''}
        {proposal.venue ? ` · ${proposal.venue}` : ''}
      </p>
      <p className="proposal-why">{proposal.why}</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="proposal-actions">
        <button
          className="button button-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              const outing = await createOuting({
                data: {
                  showId: proposal.showId,
                  productionId: proposal.productionId ?? undefined,
                  venue: proposal.venue ?? undefined,
                  city: proposal.city ?? undefined,
                  datePrecision: proposal.datePrecision,
                  occurredOn: proposal.occurredOn ?? undefined,
                  occurredMonth: proposal.occurredMonth ?? undefined,
                  occurredYear: proposal.occurredYear ?? undefined,
                  approximateDate: proposal.approximateDate ?? undefined,
                  attendeeIds: [],
                  favorite: false,
                },
              })
              setSaved(outing.id)
            } catch (caughtError) {
              setError(
                caughtError instanceof Error ? caughtError.message : 'We could not log that.',
              )
              setBusy(false)
            }
          }}
          type="button"
        >
          {busy ? 'Logging…' : 'Log this night'}
        </button>
        <Link className="text-action" search={{ show: proposal.showId }} to="/log">
          Fill it in myself
        </Link>
      </div>
    </div>
  )
}
