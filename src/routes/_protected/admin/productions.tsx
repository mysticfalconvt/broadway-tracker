import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import {
  deleteProduction,
  getProductionsForAdmin,
  getPublishedShowsForAdmin,
  saveProduction,
} from '../../../server/catalog-functions'

export const Route = createFileRoute('/_protected/admin/productions')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => getPublishedShowsForAdmin(),
  component: ProductionAdmin,
})

type Production = Awaited<ReturnType<typeof getProductionsForAdmin>>[number]

function ProductionAdmin() {
  const shows = Route.useLoaderData()
  const [showId, setShowId] = useState(shows[0]?.id ?? '')
  const [productions, setProductions] = useState<Production[]>([])

  useEffect(() => {
    if (!showId) return
    void getProductionsForAdmin({ data: { showId } }).then(setProductions)
  }, [showId])

  function refresh() {
    if (showId) void getProductionsForAdmin({ data: { showId } }).then(setProductions)
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Catalog administration</p>
        <h1>Shape each production.</h1>
        <p>
          A show is the work. Productions capture a particular Broadway, touring, regional, or local
          staging.
        </p>
      </header>
      {shows.length ? (
        <>
          <label className="admin-show-picker">
            Show
            <select value={showId} onChange={(event) => setShowId(event.target.value)}>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.title}
                </option>
              ))}
            </select>
          </label>
          <ProductionForm showId={showId} onSaved={refresh} />
          <section className="production-list" aria-label="Existing productions">
            {productions.map((production) => (
              <ProductionForm
                key={production.id}
                showId={showId}
                production={production}
                onSaved={refresh}
              />
            ))}
          </section>
        </>
      ) : (
        <section className="catalog-empty">
          <h2>Publish a show first.</h2>
          <p>Productions belong to a published catalog record.</p>
        </section>
      )}
    </main>
  )
}

function ProductionForm({
  showId,
  production,
  onSaved,
}: {
  showId: string
  production?: Production
  onSaved: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setIsPending(true)
    try {
      await saveProduction({
        data: {
          id: production?.id,
          showId,
          name: String(form.get('name')),
          productionType: form.get('productionType') as
            | 'broadway'
            | 'off_broadway'
            | 'tour'
            | 'regional'
            | 'local'
            | 'other',
          venue: String(form.get('venue')).trim() || undefined,
          city: String(form.get('city')).trim() || undefined,
          country: String(form.get('country')).trim() || undefined,
          openedOn: String(form.get('openedOn')) || undefined,
          closedOn: String(form.get('closedOn')) || undefined,
        },
      })
      event.currentTarget.reset()
      onSaved()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not save this production.',
      )
    } finally {
      setIsPending(false)
    }
  }
  async function remove() {
    if (!production || !window.confirm(`Delete ${production.name}?`)) return
    await deleteProduction({ data: { id: production.id } })
    onSaved()
  }
  return (
    <article className="production-editor">
      <h2>{production ? production.name : 'Add a production'}</h2>
      <form onSubmit={save}>
        <label>
          Name
          <input name="name" defaultValue={production?.name} required />
        </label>
        <label>
          Production type
          <select name="productionType" defaultValue={production?.productionType ?? 'broadway'}>
            <option value="broadway">Broadway</option>
            <option value="off_broadway">Off-Broadway</option>
            <option value="tour">Tour</option>
            <option value="regional">Regional</option>
            <option value="local">Local</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Venue
          <input name="venue" defaultValue={production?.venue ?? ''} />
        </label>
        <label>
          City
          <input name="city" defaultValue={production?.city ?? ''} />
        </label>
        <label>
          Country
          <input name="country" defaultValue={production?.country ?? ''} />
        </label>
        <label>
          Opened
          <input name="openedOn" type="date" defaultValue={production?.openedOn ?? ''} />
        </label>
        <label>
          Closed
          <input name="closedOn" type="date" defaultValue={production?.closedOn ?? ''} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="settings-actions">
          <button className="button button-primary" type="submit" disabled={isPending}>
            {production ? 'Save production' : 'Add production'}
          </button>
          {production ? (
            <button className="button button-quiet" type="button" onClick={remove}>
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </article>
  )
}
