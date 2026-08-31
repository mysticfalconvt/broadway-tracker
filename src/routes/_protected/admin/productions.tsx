import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { ShowArtwork } from '../../../components/ShowArtwork'
import {
  deleteProduction,
  getProductionsForAdmin,
  getRecentProductions,
  getPublishedShowsForAdmin,
  saveProduction,
} from '../../../server/catalog-functions'
import { getVenuesForAdmin } from '../../../server/venue-functions'

export const Route = createFileRoute('/_protected/admin/productions')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({
    shows: await getPublishedShowsForAdmin(),
    // Resolved here rather than after mount: a list that says "nothing
    // recorded yet" for a moment, on a screen whose whole job is fixing what
    // was just recorded, is worse than a slightly later first paint.
    recent: await getRecentProductions({ data: {} }),
    // Every theatre already on record, so a staging can be attached to one
    // rather than described again in slightly different words.
    venues: await getVenuesForAdmin(),
  }),
  component: ProductionAdmin,
})

/** Cover art is catalog data, so only an administrator may replace it. */
function CoverField({
  show,
}: {
  show: { id: string; title: string; coverImageKey: string | null }
}) {
  const [coverImageKey, setCoverImageKey] = useState(show.coverImageKey)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setProblem(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.set('kind', 'show-cover')
      body.set('showId', show.id)
      body.set('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body })
      const payload = (await response.json()) as { key?: string; error?: string }
      if (!response.ok || !payload.key) throw new Error(payload.error ?? 'Upload failed.')
      setCoverImageKey(payload.key)
    } catch (caughtError) {
      setProblem(caughtError instanceof Error ? caughtError.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="cover-field">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Cover art</p>
          <h2>{show.title}</h2>
        </div>
      </div>
      <div className="cover-field-row">
        <div className="cover-field-preview">
          <ShowArtwork title={show.title} type="Cover" coverImageKey={coverImageKey} />
        </div>
        <div>
          <label className="avatar-field-input">
            <span>{coverImageKey ? 'Replace cover' : 'Upload a cover'}</span>
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
          <p className="settings-note">
            PNG, JPEG, or WebP, up to 8MB. Artwork is optional — every screen reads well without it.
          </p>
          {busy ? <p className="settings-note">Uploading…</p> : null}
          {problem ? (
            <p className="form-error" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

type Production = Awaited<ReturnType<typeof getProductionsForAdmin>>[number]
type Recent = Awaited<ReturnType<typeof getRecentProductions>>[number]

/**
 * Only what the form actually fills in, so it can be handed a row from either
 * the per-show list or the flat one without either having to pretend to be a
 * whole database record.
 */
type EditableProduction = {
  id: string
  name: string
  productionType: Production['productionType']
  venue: string | null
  city: string | null
  country: string | null
  openedOn: string | null
  closedOn: string | null
}

function ProductionAdmin() {
  const { shows, recent: initialRecent, venues } = Route.useLoaderData()
  const [showId, setShowId] = useState(shows[0]?.id ?? '')
  const [productions, setProductions] = useState<Production[]>([])
  // What just landed, whichever show it belongs to. After an import an
  // administrator knows the venue was wrong, not which of hundreds of shows to
  // pick from a list to reach it.
  const [recent, setRecent] = useState<Recent[]>(initialRecent)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    if (!showId) return
    void getProductionsForAdmin({ data: { showId } }).then(setProductions)
  }, [showId])

  // Only re-asks once somebody types; the first list came with the page.
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    if (!searched) return
    const timer = setTimeout(() => {
      void getRecentProductions({ data: { query } }).then(setRecent)
    }, 200)
    return () => clearTimeout(timer)
  }, [query, searched])

  function refresh() {
    if (showId) void getProductionsForAdmin({ data: { showId } }).then(setProductions)
    void getRecentProductions({ data: { query } }).then(setRecent)
  }

  const selected = shows.find((show) => show.id === showId)

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
      <section className="recent-productions">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Everything recorded</p>
            <h2>Fix what just arrived.</h2>
          </div>
        </div>
        <label className="people-filter">
          Find a production
          <input
            onChange={(event) => {
              setSearched(true)
              setQuery(event.target.value)
            }}
            placeholder="A show, a staging, or a theatre"
            type="search"
            value={query}
          />
        </label>
        {recent.length ? (
          <ul className="recent-production-list">
            {recent.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.showTitle}</strong>
                  <span>
                    {row.name}
                    {row.venue ? ` · ${row.venue}` : ''}
                    {row.city ? `, ${row.city}` : ''}
                    {row.scope === 'local' ? ' · local' : ''}
                  </span>
                </div>
                <button
                  className="button button-quiet"
                  onClick={() => setEditing(editing === row.id ? null : row.id)}
                  type="button"
                >
                  {editing === row.id ? 'Close' : 'Edit'}
                </button>
                {editing === row.id ? (
                  <ProductionForm
                    onSaved={refresh}
                    venues={venues}
                    production={{
                      id: row.id,
                      name: row.name,
                      productionType: row.productionType,
                      venue: row.venue,
                      city: row.city,
                      country: row.country,
                      openedOn: row.openedOn,
                      closedOn: row.closedOn,
                    }}
                    showId={row.showId}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-empty">
            {query ? 'Nothing matches that.' : 'No productions recorded yet.'}
          </p>
        )}
      </section>

      {selected ? <CoverField key={selected.id} show={selected} /> : null}
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
          <ProductionForm showId={showId} onSaved={refresh} venues={venues} />
          <section className="production-list" aria-label="Existing productions">
            {productions.map((production) => (
              <ProductionForm
                key={production.id}
                showId={showId}
                production={production}
                venues={venues}
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
  venues,
}: {
  showId: string
  production?: EditableProduction
  onSaved: () => void
  venues: Awaited<ReturnType<typeof getVenuesForAdmin>>
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
        {/*
          A theatre is matched on its name *and* its town, so typing a name that
          is one word off — or right but with the city left blank — does not
          find the saved record, it makes a second one. Choosing from what is
          already there fills both fields at once and cannot fork them.
        */}
        <label>
          Saved theatre
          <select
            onChange={(event) => {
              const chosen = venues.find((one) => one.id === event.target.value)
              if (!chosen) return
              const form = event.target.form
              if (!form) return
              ;(form.elements.namedItem('venue') as HTMLInputElement).value = chosen.name
              ;(form.elements.namedItem('city') as HTMLInputElement).value = chosen.city ?? ''
              ;(form.elements.namedItem('country') as HTMLInputElement).value = chosen.country ?? ''
            }}
            value=""
          >
            <option value="">Choose one, or type a new theatre below</option>
            {venues.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
                {one.city ? ` — ${one.city}` : ''}
              </option>
            ))}
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
