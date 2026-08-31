import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { getRecentContributions } from '../../../server/admin-functions'
import { dropCasting } from '../../../server/people-functions'

/**
 * What has been added to the catalog lately, and by whom.
 *
 * A member's key can add cast to any show — more than the website offers them,
 * and deliberately so, because fifteen people filling an otherwise empty
 * catalog is the point of the whole layer. What makes that safe is not a gate
 * but a light on. A bad run of entries arrives as a run, from one person, in
 * one minute, and reads as one here instead of having to be stumbled on a row
 * at a time.
 */
export const Route = createFileRoute('/_protected/admin/contributions')({
  component: Contributions,
  loader: async () => ({ rows: await getRecentContributions() }),
})

const WHAT_IT_MEANS = {
  member: 'somebody in the room said so',
  import: 'pasted in from a prepared document',
  research: 'a machine read it off a page',
} as const

function Contributions() {
  const { rows } = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <main className="page-wrap">
      <header className="settings-header">
        <p className="eyebrow">The catalog</p>
        <h1>Lately added</h1>
        <p>Who put each claim there, and what it rests on.</p>
      </header>

      {rows.length === 0 ? (
        <p className="empty-note">Nothing yet.</p>
      ) : (
        <ul className="contribution-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <p className="contribution-what">
                  <strong>{row.personName}</strong> as {row.role}
                </p>
                <p className="contribution-where">
                  <Link params={{ slug: row.showSlug }} to="/shows/$slug">
                    {row.showTitle}
                  </Link>
                  {row.showStatus === 'pending' ? ' (awaiting review)' : ''} · {row.productionName}
                </p>
                <p className="contribution-who">
                  {row.byName ?? 'somebody since removed'} ·{' '}
                  {WHAT_IT_MEANS[row.source as keyof typeof WHAT_IT_MEANS]}
                  {row.sourceNote ? (
                    <>
                      {' · '}
                      <a href={row.sourceNote} rel="noreferrer noopener" target="_blank">
                        source
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                className="text-action text-action-warn"
                disabled={busy === row.id}
                onClick={async () => {
                  setBusy(row.id)
                  try {
                    await dropCasting({ data: { id: row.id } })
                    await router.invalidate()
                  } finally {
                    setBusy(null)
                  }
                }}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
