import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { ShowArtwork } from '../../components/ShowArtwork'
import {
  addShowToList,
  getListForViewer,
  saveList,
  moveListItem,
  removeShowFromList,
} from '../../server/list-functions'
import { searchPublishedShows } from '../../server/catalog-functions'

export const Route = createFileRoute('/lists/$id')({
  loader: async ({ params }) => {
    const list = await getListForViewer({ data: { id: params.id } }).catch(() => {
      // Forbidden and missing are the same answer here, so both read as a dead link.
      throw notFound()
    })
    // Only the owner can add shows, so skip the picker query for a friend's shelf.
    return { list, shows: list.canEdit ? await searchPublishedShows({ data: { query: '' } }) : [] }
  },
  component: ListDetail,
  notFoundComponent: ListNotFound,
})

function ListNotFound() {
  return (
    <main className="page-wrap empty-state">
      <p className="eyebrow">Nothing here</p>
      <h1>This list isn’t available.</h1>
      <p>It may be private, shared only with friends, or no longer exist.</p>
      <Link className="button button-primary" to="/">
        Back to Broadway Tracker
      </Link>
    </main>
  )
}

function ListDetail() {
  const { list, shows } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await addShowToList({
        data: { listId: list.id, showId: String(new FormData(event.currentTarget).get('showId')) },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not add this show.')
    }
  }
  async function update(showId: string, action: 'remove' | 'up' | 'down') {
    if (action === 'remove') await removeShowFromList({ data: { listId: list.id, showId } })
    else await moveListItem({ data: { listId: list.id, showId, direction: action } })
    window.location.reload()
  }
  return (
    <main className="lists-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">
          {list.canEdit
            ? list.visibility === 'public'
              ? 'Public list'
              : list.visibility === 'friends'
                ? 'Friends list'
                : 'Private list'
            : list.owner
              ? `Shared by ${list.owner.name}`
              : 'A public shelf'}
        </p>
        <h1>{list.title}</h1>
        <p>{list.description || 'A collected shelf of shows.'}</p>
      </header>
      {list.canEdit ? <ListSettings list={list} /> : null}
      {list.canEdit ? (
        <form className="list-add-form" onSubmit={add}>
          <label>
            Add a show
            <select name="showId" required>
              <option value="">Choose a show</option>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary" type="submit">
            Add show
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="list-items">
        {list.items.map((item, index) => (
          <article key={item.showId}>
            <Link to="/shows/$slug" params={{ slug: item.slug }}>
              <ShowArtwork title={item.title} type={item.type} coverImageKey={item.coverImageKey} />
              <span>
                <h2>{item.title}</h2>
                <p>{item.type}</p>
              </span>
            </Link>
            {list.canEdit ? (
              <div>
                <button
                  type="button"
                  onClick={() => update(item.showId, 'up')}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => update(item.showId, 'down')}
                  disabled={index === list.items.length - 1}
                >
                  Down
                </button>
                <button type="button" onClick={() => update(item.showId, 'remove')}>
                  Remove
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </main>
  )
}

/** Renaming a list and changing who can see it, without leaving the page. */
function ListSettings({ list }: { list: Awaited<ReturnType<typeof getListForViewer>> }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await saveList({
        data: {
          id: list.id,
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? '').trim() || undefined,
          visibility: String(form.get('visibility') ?? 'friends') as 'friends',
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  if (!open) {
    return (
      <button className="text-action" type="button" onClick={() => setOpen(true)}>
        Rename this list or change who can see it
      </button>
    )
  }
  return (
    <form className="settings-form outing-form" onSubmit={submit}>
      <label>
        Title
        <input name="title" defaultValue={list.title} required />
      </label>
      <label>
        Description <span>Optional</span>
        <textarea name="description" rows={2} defaultValue={list.description ?? ''} />
      </label>
      <label>
        Who can see it
        <select name="visibility" defaultValue={list.visibility}>
          <option value="private">Only me</option>
          <option value="friends">Friends</option>
          <option value="public">Anyone — shown without your name</option>
        </select>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-actions">
        <button className="button button-primary" type="submit">
          Save
        </button>
        <button className="button button-quiet" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
