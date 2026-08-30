import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { pressed } from '../../../lib/form'

import {
  getPendingShows,
  mergeShowIntoPublishedShow,
  reviewShow,
} from '../../../server/catalog-functions'

export const Route = createFileRoute('/_protected/admin/catalog')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => getPendingShows(),
  component: CatalogAdmin,
})

function CatalogAdmin() {
  const pendingShows = Route.useLoaderData()
  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Catalog administration</p>
        <h1>Review submissions.</h1>
        <p>
          {pendingShows.length} pending {pendingShows.length === 1 ? 'show' : 'shows'} in the shared
          archive.
        </p>
      </header>
      {pendingShows.length ? (
        <div className="admin-queue">
          {pendingShows.map((show) => (
            <ReviewCard key={show.id} show={show} />
          ))}
        </div>
      ) : (
        <section className="catalog-empty">
          <h2>The queue is clear.</h2>
          <p>New member submissions will appear here for review.</p>
        </section>
      )}
    </main>
  )
}

function ReviewCard({ show }: { show: Awaited<ReturnType<typeof getPendingShows>>[number] }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    // Not `form.get('action')`: a FormData built by hand leaves the submitter
    // out, so that read is always null and this guard silently swallowed every
    // press of both buttons.
    const action = pressed(event)
    if (action !== 'publish' && action !== 'reject') return
    setError(null)
    setIsPending(true)
    try {
      await reviewShow({
        data: {
          id: show.id,
          action,
          title: String(form.get('title')),
          type:
            form.get('type') === 'play'
              ? 'play'
              : form.get('type') === 'other'
                ? 'other'
                : 'musical',
          synopsis: String(form.get('synopsis')).trim() || undefined,
          slug: String(form.get('slug')),
        },
      })
      window.location.reload()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not review this submission.',
      )
      setIsPending(false)
    }
  }
  async function merge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetSlug = String(new FormData(event.currentTarget).get('targetSlug')).trim()
    setError(null)
    setIsPending(true)
    try {
      await mergeShowIntoPublishedShow({ data: { sourceShowId: show.id, targetSlug } })
      window.location.reload()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not merge this submission.',
      )
      setIsPending(false)
    }
  }
  return (
    <article className="admin-review-card">
      {/* Who added this and when, so a reviewer is not deciding blind. */}
      <p className="provenance">
        Submitted by {show.submittedByName ?? 'a former member'}
        {show.submittedByHandle ? ` (@${show.submittedByHandle})` : ''} ·{' '}
        {new Date(show.createdAt).toISOString().slice(0, 10)}
      </p>
      <form onSubmit={review}>
        <label>
          Title
          <input name="title" defaultValue={show.title} required />
        </label>
        <label>
          Type
          <select name="type" defaultValue={show.type}>
            <option value="musical">Musical</option>
            <option value="play">Play</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          URL slug
          <input name="slug" defaultValue={show.slug} required />
        </label>
        <label>
          Synopsis
          <textarea name="synopsis" defaultValue={show.synopsis ?? ''} rows={4} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="settings-actions">
          <button
            className="button button-primary"
            type="submit"
            name="action"
            value="publish"
            disabled={isPending}
          >
            Publish
          </button>
          <button
            className="button button-quiet"
            type="submit"
            name="action"
            value="reject"
            disabled={isPending}
          >
            Reject
          </button>
        </div>
      </form>
      <form className="merge-form" onSubmit={merge}>
        <label>
          Merge into published slug
          <input name="targetSlug" placeholder="existing-show-slug" required />
        </label>
        <button className="text-action" type="submit" disabled={isPending}>
          Merge duplicate
        </button>
      </form>
    </article>
  )
}
