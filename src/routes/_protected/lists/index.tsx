import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { createList, getMyLists } from '../../../server/list-functions'

export const Route = createFileRoute('/_protected/lists/')({
  loader: () => getMyLists(),
  component: Lists,
})

function Lists() {
  const lists = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      const list = await createList({
        data: {
          title: String(form.get('title')),
          description: String(form.get('description')).trim() || undefined,
          visibility:
            form.get('visibility') === 'friends'
              ? 'friends'
              : form.get('visibility') === 'public'
                ? 'public'
                : 'private',
        },
      })
      window.location.assign(`/lists/${list.id}`)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not create this list.',
      )
    }
  }
  return (
    <main className="lists-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">My theatre</p>
        <h1>Lists to keep.</h1>
        <p>Build private shelves for the shows you want to remember together.</p>
      </header>
      <form className="settings-form" onSubmit={submit}>
        <label>
          List title
          <input name="title" required />
        </label>
        <label>
          Description <span>Optional</span>
          <textarea name="description" rows={3} />
        </label>
        <label>
          Visible to
          <select name="visibility" defaultValue="friends">
            <option value="private">Only me</option>
            <option value="friends">Friends</option>
            <option value="public">Public — anonymous, no name attached</option>
          </select>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-primary" type="submit">
          Create list
        </button>
      </form>
      <section className="list-index">
        {lists.map((list) => (
          <Link key={list.id} to="/lists/$id" params={{ id: list.id }}>
            <h2>{list.title}</h2>
            <p>
              {list.itemCount} {list.itemCount === 1 ? 'show' : 'shows'} ·{' '}
              {list.visibility === 'friends'
                ? 'Friends'
                : list.visibility === 'public'
                  ? 'Public'
                  : 'Only me'}
            </p>
          </Link>
        ))}
      </section>
    </main>
  )
}
