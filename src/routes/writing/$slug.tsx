import { Link, createFileRoute } from '@tanstack/react-router'

import { getPost } from '../../server/post-functions'

export const Route = createFileRoute('/writing/$slug')({
  loader: ({ params }) => getPost({ data: { slug: params.slug } }),
  component: Piece,
})

/**
 * A piece, rendered as plain paragraphs.
 *
 * Blank lines separate paragraphs and nothing else is interpreted. Markdown
 * would ask family who have never seen it to learn a syntax to write a
 * sentence, and interpreting member-written text as markup is a hole to keep
 * shut. React escapes every one of these.
 */
function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function Piece() {
  const piece = Route.useLoaderData()

  if (!piece) {
    return (
      <main className="page-wrap empty-state">
        <p className="eyebrow">Not here</p>
        <h1>That piece is not here.</h1>
        <Link className="button button-primary" to="/writing">
          Everything else
        </Link>
      </main>
    )
  }

  const about = piece.showSlug ? (
    <Link params={{ slug: piece.showSlug }} to="/shows/$slug">
      {piece.showTitle}
    </Link>
  ) : piece.venueId && piece.venueName ? (
    <Link params={{ id: piece.venueId }} to="/venues/$id">
      {piece.venueName}
    </Link>
  ) : piece.personId && piece.personName ? (
    <Link params={{ id: piece.personId }} to="/artists/$id">
      {piece.personName}
    </Link>
  ) : null

  return (
    <main className="page-wrap piece-page">
      <header className="settings-header">
        {piece.kind === 'editorial' ? <p className="eyebrow">Editorial</p> : null}
        <h1>{piece.title}</h1>
        <p className="piece-meta">
          {piece.byline ?? 'Unsigned'}
          {piece.publishedAt
            ? ` · ${new Date(piece.publishedAt).toISOString().slice(0, 10)}`
            : ' · draft'}
        </p>
        {about ? <p className="piece-about">On {about}</p> : null}
        {piece.isMine ? (
          <Link className="text-action" search={{ piece: piece.slug }} to="/write">
            Edit this
          </Link>
        ) : null}
      </header>

      <article className="piece-body">
        {paragraphs(piece.body).map((block) => (
          <p key={block.slice(0, 40)}>{block}</p>
        ))}
      </article>
    </main>
  )
}
