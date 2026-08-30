import { Link, createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { type Answer, ask } from '../../server/ask-functions'
import { createOuting } from '../../server/outing-functions'
import { addResearchedShow, proposeShowResearch } from '../../server/research-functions'

export const Route = createFileRoute('/_protected/ask')({ component: Ask })

type Exchange = { question: string; answer: Answer }

function Ask() {
  const [history, setHistory] = useState<Exchange[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function put(asked: string) {
    const answer = await ask({ data: { question: asked } })
    setHistory((previous) => [...previous, { question: asked, answer }])
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const asked = question.trim()
    if (!asked) return
    setBusy(true)
    setError(null)
    try {
      await put(asked)
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
            {exchange.answer.lookUp ? (
              <LookUp onAdded={() => put(exchange.question)} title={exchange.answer.lookUp} />
            ) : null}
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

/** What a proposal holds, read for the summary rather than trusted. */
type Found = {
  shows?: {
    title?: string
    productions?: { name?: string; venue?: string; cast?: unknown[] }[]
  }[]
}

/**
 * Filling a gap in the catalog, when somebody asks about a show nobody entered.
 *
 * Two steps on purpose. The first reads the web and shows what it found; the
 * second writes it, and only after a person has looked. The middle screen is
 * the whole point — what comes back is a machine's reading of a web page, and
 * on the first run it put the right actor under the wrong role.
 */
function LookUp({ title, onAdded }: { title: string; onAdded: () => Promise<void> }) {
  const [stage, setStage] = useState<'idle' | 'looking' | 'found' | 'adding' | 'done'>('idle')
  const [proposal, setProposal] = useState<{
    json: string
    sources: { title: string; url: string }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (stage === 'done') return <p className="exchange-saved">Added, and waiting on review.</p>

  if (stage === 'idle' || stage === 'looking') {
    return (
      <div className="proposal">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="proposal-actions">
          <button
            className="button button-primary"
            disabled={stage === 'looking'}
            onClick={async () => {
              setStage('looking')
              setError(null)
              try {
                setProposal(await proposeShowResearch({ data: { title } }))
                setStage('found')
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'That look-up failed.')
                setStage('idle')
              }
            }}
            type="button"
          >
            {stage === 'looking' ? `Reading about ${title}…` : `Look up ${title}`}
          </button>
        </div>
      </div>
    )
  }

  const found = (() => {
    try {
      return JSON.parse(proposal?.json ?? '{}') as Found
    } catch {
      return {} as Found
    }
  })()
  const show = found.shows?.[0]
  const productions = show?.productions ?? []
  const people = productions.reduce((total, one) => total + (one.cast?.length ?? 0), 0)

  return (
    <div className="proposal">
      <p className="proposal-what">
        <strong>{show?.title ?? title}</strong>
        {productions.length
          ? ` · ${productions.length} production${productions.length === 1 ? '' : 's'}`
          : ''}
        {people ? ` · ${people} in the cast` : ''}
      </p>
      <p className="proposal-why">
        Read from {proposal?.sources.map((source) => source.title).join(', ')}. Nobody has checked
        it.
      </p>
      <details className="exchange-working">
        <summary>What was found</summary>
        <pre className="research-json">{proposal?.json}</pre>
      </details>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="proposal-actions">
        <button
          className="button button-primary"
          disabled={stage === 'adding'}
          onClick={async () => {
            setStage('adding')
            setError(null)
            try {
              await addResearchedShow({ data: { json: proposal?.json ?? '' } })
              setStage('done')
              // Ask the original question again, now that it can be answered.
              await onAdded()
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'That could not be added.')
              setStage('found')
            }
          }}
          type="button"
        >
          {stage === 'adding' ? 'Adding…' : 'Add it'}
        </button>
        <button className="text-action" onClick={() => setStage('idle')} type="button">
          No thanks
        </button>
      </div>
    </div>
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
