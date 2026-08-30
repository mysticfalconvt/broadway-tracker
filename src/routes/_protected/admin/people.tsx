import { createFileRoute, redirect } from '@tanstack/react-router'
import { type FormEvent, useMemo, useState } from 'react'

import { normalizePersonName } from '../../../lib/person'
import {
  getPeopleForAdmin,
  getPersonSuspicions,
  mergePersonInto,
  savePerson,
} from '../../../server/people-functions'

export const Route = createFileRoute('/_protected/admin/people')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({
    people: await getPeopleForAdmin(),
    suspicions: await getPersonSuspicions(),
  }),
  component: PeopleAdmin,
})

type Person = Awaited<ReturnType<typeof getPeopleForAdmin>>[number]

/** What a merge would take with it, said plainly before it happens. */
function weightOf(person: Person) {
  const parts = []
  if (person.castingCount) {
    parts.push(`${person.castingCount} ${person.castingCount === 1 ? 'role' : 'roles'}`)
  }
  if (person.seenCount) {
    parts.push(`seen on ${person.seenCount} ${person.seenCount === 1 ? 'night' : 'nights'}`)
  }
  return parts.length ? parts.join(' · ') : 'nothing recorded yet'
}

function PeopleAdmin() {
  const { people, suspicions } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const shown = useMemo(() => {
    const needle = normalizePersonName(filter)
    if (!needle) return people
    return people.filter((person) => normalizePersonName(person.name).includes(needle))
  }, [people, filter])

  async function merge(sourceId: string, targetId: string) {
    setError(null)
    try {
      await mergePersonInto({ data: { sourceId, targetId } })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not merge those.')
    }
  }

  /** Merging deletes a row, so it is worth naming what goes where first. */
  async function confirmMerge(source: Person, target: Person) {
    const agreed = window.confirm(
      `Fold “${source.name}” (${weightOf(source)}) into “${target.name}”?\n\n` +
        'Their roles and every record of who members saw move across. ' +
        `“${source.name}” is then removed. This cannot be undone.`,
    )
    if (agreed) await merge(source.id, target.id)
  }

  async function mergeChosen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const sourceId = String(form.get('sourceId'))
    const targetId = String(form.get('targetId'))
    if (!targetId) {
      setError('Choose who to keep.')
      return
    }
    const source = people.find((person) => person.id === sourceId)
    const target = people.find((person) => person.id === targetId)
    if (source && target) await confirmMerge(source, target)
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await savePerson({
        data: {
          id: String(form.get('id')),
          name: String(form.get('name')),
          note: String(form.get('note') ?? '').trim() || undefined,
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>People.</h1>
        <p>
          Members add performers as they record who they saw, so the same person arrives spelled
          more than one way. Names are only folded together when they match exactly — the rest is a
          judgement, and it is made here.
        </p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {suspicions.length ? (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Possible duplicates</p>
              <h2>These look like the same person.</h2>
            </div>
          </div>
          <ul className="suspect-list">
            {suspicions.map((pair) => {
              const a = people.find((person) => person.id === pair.a.id)
              const b = people.find((person) => person.id === pair.b.id)
              if (!a || !b) return null
              return (
                <li key={`${a.id}-${b.id}`}>
                  <span>
                    <strong>{a.name}</strong> <em>{weightOf(a)}</em>
                  </span>
                  <span>
                    <strong>{b.name}</strong> <em>{weightOf(b)}</em>
                  </span>
                  <span className="suspect-score">{Math.round(pair.score * 100)}% alike</span>
                  <span className="suspect-actions">
                    <button
                      className="button button-quiet"
                      onClick={() => confirmMerge(b, a)}
                      type="button"
                    >
                      Keep “{a.name}”
                    </button>
                    <button
                      className="button button-quiet"
                      onClick={() => confirmMerge(a, b)}
                      type="button"
                    >
                      Keep “{b.name}”
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Everyone recorded</p>
            <h2>{people.length} in the catalog.</h2>
          </div>
        </div>

        <label className="people-filter">
          Find somebody
          <input
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Start typing a name"
            type="search"
            value={filter}
          />
        </label>

        {shown.length ? (
          <div className="venue-list">
            {shown.map((person) => (
              <div className="person-row" key={person.id}>
                <form onSubmit={rename}>
                  <input name="id" type="hidden" value={person.id} />
                  <label>
                    Name
                    <input defaultValue={person.name} name="name" required />
                  </label>
                  <label>
                    Note
                    <input
                      defaultValue={person.note ?? ''}
                      name="note"
                      placeholder="Anything worth remembering"
                    />
                  </label>
                  <p className="venue-usage">{weightOf(person)}</p>
                  <button className="button button-quiet" type="submit">
                    Save
                  </button>
                </form>
                <form className="merge-form" onSubmit={mergeChosen}>
                  <input name="sourceId" type="hidden" value={person.id} />
                  <label>
                    Fold into
                    <select defaultValue="" name="targetId">
                      <option value="">Keep separate</option>
                      {people
                        .filter((other) => other.id !== person.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="button button-quiet" type="submit">
                    Merge
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-empty">
            {people.length ? 'Nobody by that name.' : 'Nobody recorded yet.'}
          </p>
        )}
      </section>
    </main>
  )
}
