import { Link, createFileRoute } from '@tanstack/react-router'

import { ShowArtwork } from '../../components/ShowArtwork'
import { getPublishedShow } from '../../server/catalog-functions'

export const Route = createFileRoute('/shows/$slug')({
  loader: ({ params }) => getPublishedShow({ data: { slug: params.slug } }),
  component: ShowDetail,
})

function ShowDetail() {
  const show = Route.useLoaderData()

  if (!show) {
    return (
      <main className="show-missing page-wrap">
        <p className="eyebrow">Not in the archive</p>
        <h1>That show is not published here.</h1>
        <Link to="/discover" className="button button-primary">
          Search the catalog
        </Link>
      </main>
    )
  }

  return (
    <main>
      <section className="show-hero">
        <div className="page-wrap show-hero-content">
          <ShowArtwork title={show.title} type={show.type} tone="oxblood" />
          <div>
            <p className="eyebrow">{show.type}</p>
            <h1>{show.title}</h1>
            <p>This shared catalog record is ready for your theatre history.</p>
          </div>
        </div>
      </section>
      <section className="show-detail-body page-wrap">
        <div>
          <p className="eyebrow">About the show</p>
          <h2>The work itself.</h2>
          <p>{show.synopsis || 'A catalog description has not been added yet.'}</p>
        </div>
        <aside>
          <p className="eyebrow">Your theatre</p>
          <p>
            Personal library and performance logging will appear here once the core collection flow
            is ready.
          </p>
        </aside>
      </section>
    </main>
  )
}
