import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'

import { authClient } from '../lib/auth-client'
import { getNavBadges } from '../server/admin-functions'
import { getSession } from '../server/auth-functions'

import '../styles.css'

export const Route = createRootRoute({
  // Resolved on the server so the first paint shows the correct navigation
  // rather than flashing the signed-out links at a signed-in reader.
  loader: async () => ({ session: await getSession(), badges: await getNavBadges() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#17202B' },
      { title: 'Broadway Tracker' },
      {
        name: 'description',
        content: 'A personal library for the shows you love, have seen, and hope to see.',
      },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap',
      },
    ],
  }),
  shellComponent: RootShell,
  notFoundComponent: NotFound,
})

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="site-header">
          <nav className="page-wrap site-nav" aria-label="Main navigation">
            <Link to="/" className="brand">
              Broadway Tracker
            </Link>
            <NavLinks />
          </nav>
        </header>
        {children}
        <ReportLink />
        <Scripts />
      </body>
    </html>
  )
}

/**
 * A quiet, always-present way to say something is broken. It sits outside the
 * navigation so the product areas stay short, and it carries the page it was
 * pressed on, which is usually the detail a reporter forgets to mention.
 */
function ReportLink() {
  // The server session, not the client hook: the hook is empty during SSR, so
  // the link would only appear after hydration.
  const { session } = Route.useLoaderData()
  const [path, setPath] = useState<string | null>(null)
  // Read after mount, so the rendered href matches on both sides at hydration.
  useEffect(() => setPath(window.location.pathname), [])
  if (!session) return null
  return (
    <Link
      className="report-link"
      to="/feedback"
      search={{ from: path ?? undefined }}
      aria-label="Report a problem or suggest something"
    >
      Feedback
    </Link>
  )
}

/**
 * Every product area behind these links requires an account, so a signed-out
 * visitor is offered the catalog and a way in rather than links that bounce
 * them to the sign-in page.
 */
function NavLinks() {
  const { session: serverSession, badges } = Route.useLoaderData()
  // Same reasoning as the show page: prefer the client session once it exists,
  // fall back to the server's rather than trusting `isPending` during SSR.
  const { data: clientSession } = authClient.useSession()
  const session = clientSession ?? serverSession
  if (!session) {
    return (
      <div className="nav-links" aria-label="Product areas">
        <Link to="/discover">Discover</Link>
        <Link to="/sign-in">Sign in</Link>
        <Link to="/sign-up">Create account</Link>
      </div>
    )
  }
  return (
    <div className="nav-links" aria-label="Product areas">
      <Link to="/library">My Theatre</Link>
      <Link to="/discover">Discover</Link>
      <Link to="/lists">Lists</Link>
      <Link to="/profile">Profile</Link>
      <Link to="/friends" className="nav-with-badge">
        Friends
        {badges.friendRequests ? (
          <span
            className="nav-badge"
            aria-label={`${badges.friendRequests} friend ${
              badges.friendRequests === 1 ? 'request' : 'requests'
            } waiting`}
          >
            {badges.friendRequests}
          </span>
        ) : null}
      </Link>
      <Link to="/build-history">Build history</Link>
      {badges.isAdmin ? (
        <Link to="/admin" className="nav-with-badge">
          Admin
          {badges.waiting ? (
            <span className="nav-badge" aria-label={`${badges.waiting} awaiting review`}>
              {badges.waiting}
            </span>
          ) : null}
        </Link>
      ) : null}
    </div>
  )
}

function NotFound() {
  return (
    <main className="page-wrap empty-state">
      <p className="eyebrow">Intermission</p>
      <h1>We couldn’t find that page.</h1>
      <Link to="/" className="button button-primary">
        Return home
      </Link>
    </main>
  )
}
