import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { type ReactNode } from 'react'

import { authClient } from '../lib/auth-client'

import '../styles.css'

export const Route = createRootRoute({
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
        <Scripts />
      </body>
    </html>
  )
}

/**
 * Every product area behind these links requires an account, so a signed-out
 * visitor is offered the catalog and a way in rather than links that bounce
 * them to the sign-in page.
 */
function NavLinks() {
  const { data: session, isPending } = authClient.useSession()
  if (isPending || !session) {
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
      <Link to="/friends">Friends</Link>
      <Link to="/build-history">Build history</Link>
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
