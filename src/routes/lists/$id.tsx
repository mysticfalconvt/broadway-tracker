import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { ShowArtwork } from '../../components/ShowArtwork'
import { TierBoard } from '../../components/TierBoard'
import {
  addShowToList,
  getListForViewer,
  saveList,
  moveListItem,
  placeTierListItem,
  removeShowFromList,
  getMyTierCandidates,
} from '../../server/list-functions'
import { searchPublishedShows } from '../../server/catalog-functions'
import { TIER_LABELS } from '../../lib/tier-list'

export const Route = createFileRoute('/lists/$id')({
  loader: async ({ params }) => {
    const list = await getListForViewer({ data: { id: params.id } }).catch(() => {
      // Forbidden and missing are the same answer here, so both read as a dead link.
      throw notFound()
    })
    // Only the owner can add shows, so skip the picker query for a friend's shelf.
    return {
      list,
      shows:
        list.canEdit && list.kind === 'list'
          ? await searchPublishedShows({ data: { query: '' } })
          : [],
      candidates: list.canEdit && list.kind === 'tier_list' ? await getMyTierCandidates() : [],
    }
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
  const { list, shows, candidates } = Route.useLoaderData()
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
  async function place(showId: string, tier: 'S' | 'A' | 'B' | 'C' | 'D' | null, index: number) {
    if (!list.items.some((item) => item.showId === showId)) {
      await addShowToList({ data: { listId: list.id, showId } })
    }
    await placeTierListItem({ data: { listId: list.id, showId, tier, index } })
    window.location.reload()
  }
  return (
    <main className="lists-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">
          {list.kind === 'tier_list'
            ? list.canEdit
              ? 'My tier list'
              : list.owner
                ? `Tier list by ${list.owner.name}`
                : 'A public tier list'
            : list.canEdit
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
        <p>
          {list.description ||
            (list.kind === 'tier_list'
              ? 'A personal ranking of shows seen.'
              : 'A collected shelf of shows.')}
        </p>
      </header>
      {list.canEdit ? <ListSettings list={list} /> : null}
      {list.canEdit && list.kind === 'tier_list' ? (
        <a className="button button-quiet" href={`/api/tier-lists/${list.id}`}>
          Download image
        </a>
      ) : null}
      {list.canEdit && list.kind === 'list' ? (
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
      {list.kind === 'tier_list' ? (
        <TierBoard
          items={list.items}
          candidates={candidates}
          tierNames={list.tierNames}
          editable={list.canEdit}
          onPlace={place}
        />
      ) : (
        <div className="list-items">
          {list.items.map((item, index) => (
            <article key={item.showId}>
              <Link to="/shows/$slug" params={{ slug: item.slug }}>
                <ShowArtwork
                  title={item.title}
                  type={item.type}
                  coverImageKey={item.coverImageKey}
                />
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
      )}
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
    const tierNames =
      list.kind === 'tier_list'
        ? {
            S: String(form.get('tier-S') ?? ''),
            A: String(form.get('tier-A') ?? ''),
            B: String(form.get('tier-B') ?? ''),
            C: String(form.get('tier-C') ?? ''),
            D: String(form.get('tier-D') ?? ''),
          }
        : undefined
    setError(null)
    try {
      await saveList({
        data: {
          id: list.id,
          title: String(form.get('title') ?? ''),
          description: String(form.get('description') ?? '').trim() || undefined,
          visibility: String(form.get('visibility') ?? 'friends') as 'friends',
          tierNames,
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
    }
  }

  if (!open) {
    return (
      <button className="button button-quiet" type="button" onClick={() => setOpen(true)}>
        {list.kind === 'tier_list' ? 'Edit tier list settings' : 'Edit list settings'}
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
      {list.kind === 'tier_list' ? (
        <fieldset className="tier-name-fields">
          <legend>Tier names (S through D)</legend>
          {TIER_LABELS.map((tier) => (
            <label key={tier}>
              {tier}
              <input name={`tier-${tier}`} defaultValue={list.tierNames[tier]} required />
            </label>
          ))}
        </fieldset>
      ) : null}
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
