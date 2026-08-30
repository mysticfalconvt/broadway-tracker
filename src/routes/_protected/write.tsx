import { Link, createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { SharingField } from '../../components/SharingField'
import { formText } from '../../lib/form'
import { getMyPosts, removePost, savePost, setPostPublished } from '../../server/post-functions'
import type { Visibility } from '../../server/visibility'

export const Route = createFileRoute('/_protected/write')({
  validateSearch: (search: Record<string, unknown>) => ({
    piece: typeof search.piece === 'string' ? search.piece : undefined,
  }),
  loader: async () => ({ mine: await getMyPosts() }),
  component: Write,
})

function Write() {
  const { mine } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const { piece: editing } = Route.useSearch()
  const current = mine.find((row) => row.slug === editing)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const saved = await savePost({
        data: {
          id: current?.id,
          title: String(form.get('title')),
          body: String(form.get('body')),
          byline: formText(form, 'byline'),
          visibility: formText(form, 'visibility') as Visibility | undefined,
        },
      })
      window.location.assign(`/write?piece=${saved.slug}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not save that.')
      setBusy(false)
    }
  }

  async function setPublished(id: string, published: boolean) {
    setError(null)
    try {
      await setPostPublished({ data: { id, published } })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'We could not do that.')
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return
    await removePost({ data: { id } })
    window.location.assign('/write')
  }

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Writing</p>
        <h1>{current ? current.title : 'Something longer.'}</h1>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="settings-form" key={current?.id ?? 'new'} onSubmit={save}>
        <label>
          Title
          <input defaultValue={current?.title ?? ''} name="title" required />
        </label>
        <label>
          {/* Blank lines separate paragraphs. Nothing else is interpreted. */}
          Write
          <textarea defaultValue={current?.body ?? ''} name="body" required rows={18} />
        </label>
        <label>
          Sign it as <span>Optional</span>
          <input defaultValue={current?.byline ?? ''} name="byline" placeholder={user.name} />
          <span>Shown on the piece. Your profile stays as it is.</span>
        </label>
        <SharingField
          current={current?.visibility as Visibility | undefined}
          label="Readable by"
          name="visibility"
          profileDefault={user.profileVisibility as Visibility}
        />
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? 'Saving…' : current ? 'Save' : 'Start it'}
        </button>
      </form>

      {current ? (
        <div className="piece-actions">
          <button
            className="button button-quiet"
            onClick={() => setPublished(current.id, current.status === 'draft')}
            type="button"
          >
            {current.status === 'draft' ? 'Publish it' : 'Withdraw it'}
          </button>
          {current.status === 'published' ? (
            <Link className="text-action" params={{ slug: current.slug }} to="/writing/$slug">
              Read it
            </Link>
          ) : null}
          <button
            className="text-action"
            onClick={() => remove(current.id, current.title)}
            type="button"
          >
            Delete
          </button>
        </div>
      ) : null}

      {mine.length ? (
        <section>
          <div className="section-heading">
            <div>
              <h2>Yours.</h2>
            </div>
          </div>
          <ul className="piece-list">
            {mine.map((row) => (
              <li key={row.id}>
                <Link search={{ piece: row.slug }} to="/write">
                  <h2>{row.title}</h2>
                  <p className="piece-meta">
                    {row.status === 'draft' ? 'Draft' : 'Published'}
                    {row.showTitle ? ` · ${row.showTitle}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
