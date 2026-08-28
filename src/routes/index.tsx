import { MemoryCard } from '../components/MemoryCard'
import { PrivacyBadge } from '../components/PrivacyBadge'
import { Rating } from '../components/Rating'
import { ShowArtwork } from '../components/ShowArtwork'
import { ShowStatus } from '../components/ShowStatus'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

const wantsToSee = [
  { title: 'Operation Mincemeat', type: 'Musical', tone: 'midnight' as const },
  { title: 'Maybe Happy Ending', type: 'Musical', tone: 'paper' as const },
  { title: 'John Proctor Is the Villain', type: 'Play', tone: 'oxblood' as const },
]

function Home() {
  return (
    <main className="app-page">
      <section className="home-hero page-wrap">
        <div>
          <p className="eyebrow">Your theatre, remembered</p>
          <h1>Good evening, Robert.</h1>
          <p className="home-intro">
            A quiet place for the shows that stayed with you and the nights you shared.
          </p>
        </div>
        <div className="hero-controls">
          <button type="button" className="button button-primary">
            + Log a performance
          </button>
          <button type="button" className="button button-quiet">
            Build your history →
          </button>
        </div>
      </section>

      <section className="page-wrap theatre-summary" aria-labelledby="theatre-heading">
        <div>
          <p className="eyebrow">Your theatre</p>
          <h2 id="theatre-heading">A collection in progress.</h2>
        </div>
        <dl className="stat-list">
          <div>
            <dt>Performances</dt>
            <dd>57</dd>
          </div>
          <div>
            <dt>Shows</dt>
            <dd>42</dd>
          </div>
          <div>
            <dt>Favorites</dt>
            <dd>12</dd>
          </div>
        </dl>
      </section>

      <section className="page-wrap content-grid" aria-label="Theatre dashboard preview">
        <div className="primary-column">
          <SectionHeading
            eyebrow="Recently remembered"
            title="Collected nights"
            action="View history"
          />
          <MemoryCard
            title="Hadestown"
            type="Musical"
            date="May 18 · 2026"
            venue="Walter Kerr Theatre"
            city="New York, NY"
            attendees={['You', 'Sarah', 'Mom', 'Alex']}
            rating={5}
            review="One of those perfect nights."
          />

          <article className="recent-entry">
            <ShowArtwork title="Suffs" type="Musical" tone="midnight" />
            <div>
              <p className="memory-date">March 9 · 2026</p>
              <h3>Suffs</h3>
              <p>Music Box Theatre · New York, NY</p>
              <ShowStatus status="seen" />
            </div>
            <Rating value={4.5} size="small" />
          </article>
        </div>

        <aside className="secondary-column">
          <section className="circle-panel" aria-labelledby="circle-heading">
            <SectionHeading eyebrow="From your circle" title="A few good updates" />
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
          </section>

          <section className="privacy-panel">
            <PrivacyBadge visibility="private" />
            <p>Your library is private by default. You choose what to share.</p>
          </section>
        </aside>
      </section>

      <section className="page-wrap wants-section" aria-labelledby="wants-heading">
        <SectionHeading eyebrow="Looking ahead" title="Want to see" action="Open library" />
        <div className="show-card-grid">
          {wantsToSee.map((show) => (
            <article key={show.title} className="library-show-card">
              <ShowArtwork title={show.title} type={show.type} tone={show.tone} />
              <div className="library-show-content">
                <h3>{show.title}</h3>
                <p>{show.type}</p>
                <ShowStatus status="want_to_see" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: string
}) {
  return (
    <header className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action ? (
        <button type="button" className="text-action">
          {action} →
        </button>
      ) : null}
    </header>
  )
}
