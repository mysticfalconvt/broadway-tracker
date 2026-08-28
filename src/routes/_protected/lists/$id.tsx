import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { ShowArtwork } from '../../../components/ShowArtwork'
import {
  addShowToList,
  getMyList,
  moveListItem,
  removeShowFromList,
} from '../../../server/list-functions'
import { searchPublishedShows } from '../../../server/catalog-functions'

export const Route = createFileRoute('/_protected/lists/$id')({
  loader: async ({ params }) => ({
    list: await getMyList({ data: { id: params.id } }),
    shows: await searchPublishedShows({ data: { query: '' } }),
  }),
  component: ListDetail,
})

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
        <p className="eyebrow">{list.visibility === 'friends' ? 'Friends list' : 'Private list'}</p>
        <h1>{list.title}</h1>
        <p>{list.description || 'A collected shelf of shows.'}</p>
      </header>
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
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="list-items">
        {list.items.map((item, index) => (
          <article key={item.showId}>
            <Link to="/shows/$slug" params={{ slug: item.slug }}>
              <ShowArtwork title={item.title} type={item.type} tone="midnight" />
              <span>
                <h2>{item.title}</h2>
                <p>{item.type}</p>
              </span>
            </Link>
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
          </article>
        ))}
      </div>
    </main>
  )
}
