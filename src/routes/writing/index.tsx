import { Link, createFileRoute } from '@tanstack/react-router'

import { getPosts } from '../../server/post-functions'

export const Route = createFileRoute('/writing/')({
  loader: () => getPosts(),
  component: Writing,
})

function Writing() {
  const posts = Route.useLoaderData()

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Writing</p>
        <h1>Longer than a review.</h1>
      </header>

      {posts.length ? (
        <ul className="piece-list">
          {posts.map((piece) => (
            <li key={piece.id}>
              <Link params={{ slug: piece.slug }} to="/writing/$slug">
                {piece.kind === 'editorial' ? <span className="piece-tag">Editorial</span> : null}
                <h2>{piece.title}</h2>
                <p className="piece-opening">{piece.opening}</p>
                <p className="piece-meta">
                  {[
                    piece.byline,
                    piece.showTitle ?? piece.venueName ?? piece.personName,
                    piece.publishedAt
                      ? new Date(piece.publishedAt).toISOString().slice(0, 10)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">Nothing published yet.</p>
      )}
    </main>
  )
}
