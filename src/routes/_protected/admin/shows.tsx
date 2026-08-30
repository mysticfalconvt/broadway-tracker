import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { getPublishedShowsWithProvenance } from '../../../server/admin-functions'
import { savePublishedShow } from '../../../server/catalog-functions'

export const Route = createFileRoute('/_protected/admin/shows')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => getPublishedShowsWithProvenance(),
  component: PublishedShows,
})

function PublishedShows() {
  const shows = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await savePublishedShow({
        data: {
          id: String(form.get('id')),
          title: String(form.get('title')),
          slug: String(form.get('slug')),
          type: String(form.get('type')) as 'musical' | 'play' | 'other',
          synopsis: String(form.get('synopsis')).trim() || undefined,
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
        <p className="eyebrow">Catalog administration</p>
        <h1>Published shows.</h1>
        <p>Corrections to live records. The review queue is for undecided submissions.</p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="venue-list">
        {shows.map((show) => (
          <form key={show.id} onSubmit={save}>
            <input type="hidden" name="id" value={show.id} />
            <label>
              Title
              <input name="title" defaultValue={show.title} required />
            </label>
            <label>
              URL slug
              <input name="slug" defaultValue={show.slug} required />
            </label>
            <label>
              Type
              <select name="type" defaultValue={show.type}>
                <option value="musical">Musical</option>
                <option value="play">Play</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="admin-synopsis">
              Synopsis
              <textarea name="synopsis" rows={2} defaultValue={show.synopsis ?? ''} />
            </label>
            <p className="provenance">
              {show.submittedByName
                ? `Submitted by ${show.submittedByName}`
                : 'Added with the original catalog'}
              {show.reviewedByName ? ` · published by ${show.reviewedByName}` : ''}
              {show.reviewedAt ? ` on ${new Date(show.reviewedAt).toISOString().slice(0, 10)}` : ''}
            </p>
            <button className="button button-quiet" type="submit">
              Save
            </button>
          </form>
        ))}
      </div>
    </main>
  )
}
