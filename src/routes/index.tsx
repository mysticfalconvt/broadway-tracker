import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { MemoryCard } from '../components/MemoryCard'
import { PrivacyBadge } from '../components/PrivacyBadge'
import { Rating } from '../components/Rating'
import { ShowArtwork } from '../components/ShowArtwork'
import { ShowStatus } from '../components/ShowStatus'
import { formatFuzzyDateShort } from '../lib/fuzzy-date'
import { greetingFor } from '../lib/time'
import { getHome } from '../server/profile-functions'

export const Route = createFileRoute('/')({
  loader: () => getHome(),
  component: Home,
})

function Home() {
  const home = Route.useLoaderData()
  return home ? <SignedInHome home={home} /> : <VisitorHome />
}

function SignedInHome({ home }: { home: NonNullable<Awaited<ReturnType<typeof getHome>>> }) {
  const { name, stats, wantToSee, recent } = home
  const greeting = useLocalGreeting()
  const isNew = stats.performances === 0 && stats.shows === 0
  return (
    <main className="app-page">
      <section className="home-hero page-wrap">
        <div>
          <p className="eyebrow">Your theatre, remembered</p>
          <h1>
            {greeting}, {name.split(' ')[0]}.
          </h1>
          <p className="home-intro">
            {isNew
              ? 'Nothing collected yet. Start with last night, or reach back as far as you can remember.'
              : 'A quiet place for the shows that stayed with you and the nights you shared.'}
          </p>
        </div>
        <div className="hero-controls">
          <Link className="button button-primary" to="/log">
            + Log a performance
          </Link>
          <Link className="button button-quiet" to="/build-history">
            Build your history →
          </Link>
        </div>
      </section>

      <section className="page-wrap theatre-summary" aria-labelledby="theatre-heading">
        <div>
          <p className="eyebrow">Your theatre</p>
          <h2 id="theatre-heading">
            {isNew ? 'A collection waiting to begin.' : 'A collection in progress.'}
          </h2>
        </div>
        <dl className="stat-list">
          <div>
            <dt>Performances</dt>
            <dd>{stats.performances}</dd>
          </div>
          <div>
            <dt>Shows</dt>
            <dd>{stats.shows}</dd>
          </div>
          <div>
            <dt>Favorites</dt>
            <dd>{stats.favorites}</dd>
          </div>
        </dl>
      </section>

      <section className="page-wrap content-grid" aria-label="Theatre dashboard">
        <div className="primary-column">
          <SectionHeading eyebrow="Recently remembered" title="Collected nights" />
          {recent.length ? (
            recent.map((outing, index) =>
              index === 0 ? (
                <MemoryCard
                  key={outing.id}
                  title={outing.showTitle}
                  type={outing.showType}
                  date={formatFuzzyDateShort(outing)}
                  venue={outing.venue}
                  city={outing.city}
                  attendees={['You']}
                  rating={outing.rating ? outing.rating / 2 : undefined}
                  review={outing.review ?? undefined}
                />
              ) : (
                <article className="recent-entry" key={outing.id}>
                  <ShowArtwork
                    title={outing.showTitle}
                    type={outing.showType}
                    coverImageKey={outing.coverImageKey}
                  />
                  <div>
                    <p className="memory-date">{formatFuzzyDateShort(outing)}</p>
                    <h3>{outing.showTitle}</h3>
                    <p>{[outing.venue, outing.city].filter(Boolean).join(' · ')}</p>
                    <ShowStatus status="seen" />
                  </div>
                  {outing.rating ? <Rating value={outing.rating / 2} size="small" /> : null}
                </article>
              ),
            )
          ) : (
            <p className="profile-empty">
              No nights collected yet. <Link to="/log">Log a performance</Link> to start.
            </p>
          )}
        </div>

        <aside className="secondary-column">
          <section className="privacy-panel">
            <PrivacyBadge visibility="private" />
            <p>Your library is private by default. You choose what to share.</p>
          </section>
        </aside>
      </section>

      <section className="page-wrap wants-section" aria-labelledby="wants-heading">
        <SectionHeading eyebrow="Looking ahead" title="Want to see" />
        {wantToSee.length ? (
          <div className="show-card-grid">
            {wantToSee.map((show) => (
              <Link
                key={show.id}
                className="library-show-card"
                to="/shows/$slug"
                params={{ slug: show.slug }}
              >
                <ShowArtwork
                  title={show.title}
                  type={show.type}
                  coverImageKey={show.coverImageKey}
                />
                <div className="library-show-content">
                  <h3>{show.title}</h3>
                  <p>{show.type}</p>
                  <ShowStatus status="want_to_see" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">
            Nothing on the list yet. <Link to="/discover">Find a show</Link> to look forward to.
          </p>
        )}
      </section>
    </main>
  )
}

/**
 * The greeting depends on the reader's own clock, which the server cannot know:
 * rendering it during SSR produced a hydration mismatch whenever the browser's
 * timezone disagreed with the server's UTC. It is resolved after mount instead,
 * with a time-neutral greeting until then.
 */
function useLocalGreeting() {
  const [greeting, setGreeting] = useState<string | null>(null)
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), [])
  return greeting ?? 'Welcome back'
}

function VisitorHome() {
  return (
    <main className="app-page">
      <section className="home-hero page-wrap">
        <div>
          <p className="eyebrow">Your theatre, remembered</p>
          <h1>A journal for the shows you’ve seen.</h1>
          <p className="home-intro">
            Collect the shows that stayed with you, and keep the nights you shared with the people
            you saw them with. Private by default — you choose what to share, and with whom.
          </p>
        </div>
        <div className="hero-controls">
          <Link className="button button-primary" to="/sign-up">
            Create an account
          </Link>
          <Link className="button button-quiet" to="/discover">
            Browse the catalog →
          </Link>
        </div>
      </section>

      <section className="page-wrap content-grid" aria-label="A preview of Broadway Tracker">
        <div className="primary-column">
          <SectionHeading eyebrow="What you keep" title="Collected nights" />
          <p className="sample-note">A sample memory, to show how a night is recorded.</p>
          {/* Sample content. Labelled so a visitor never mistakes it for real activity. */}
          <div className="is-sample" aria-label="Sample memory">
            <MemoryCard
              title="Hadestown"
              type="Musical"
              date="MAY 18 · 2026"
              venue="Walter Kerr Theatre"
              city="New York, NY"
              attendees={['You', 'Sarah', 'Mom', 'Alex']}
              rating={5}
              review="One of those perfect nights."
            />
          </div>
        </div>

        <aside className="secondary-column">
          <section className="circle-panel" aria-labelledby="circle-heading">
            <SectionHeading eyebrow="From your circle" title="A few good updates" />
            <p className="sample-note">
              A sample circle. Real updates only ever come from friends you’ve approved.
            </p>
            <div className="is-sample">
              <div className="activity-item">
                <span className="activity-avatar">S</span>
                <p>
                  <strong>Sarah</strong> saw <em>Suffs</em>
                  <br />
                  <Rating value={4.5} size="small" />{' '}
                  <span>“Loved the score more than I expected.”</span>
                </p>
              </div>
              <div className="activity-item">
                <span className="activity-avatar">M</span>
                <p>
                  <strong>Mom</strong> added <em>Gypsy</em> to Want to See.
                </p>
              </div>
            </div>
          </section>

          <section className="privacy-panel">
            <PrivacyBadge visibility="private" />
            <p>
              Everything starts private. Share a shelf with friends, or publish one anonymously —
              public pages never carry your name.
            </p>
          </section>
        </aside>
      </section>
    </main>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
    </header>
  )
}
