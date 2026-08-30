import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { ShowArtwork } from '../../components/ShowArtwork'
import { formatFuzzyDate } from '../../lib/fuzzy-date'
import { getPerson } from '../../server/people-functions'

export const Route = createFileRoute('/artists/$id')({
  loader: async ({ params }) => {
    try {
      return await getPerson({ data: { id: params.id } })
    } catch {
      throw notFound()
    }
  },
  component: Person,
  notFoundComponent: PersonNotFound,
})

function PersonNotFound() {
  return (
    <main className="page-wrap empty-state">
      <p className="eyebrow">Not in the archive</p>
      <h1>Nobody by that name is recorded here.</h1>
      <Link className="button button-primary" to="/discover">
        Search the catalog
      </Link>
    </main>
  )
}

function Person() {
  const { person, roles, yourNights } = Route.useLoaderData()
  const performing = roles.filter((role) => role.kind === 'performer')
  const creative = roles.filter((role) => role.kind === 'creative')

  return (
    <main className="person-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">In the theatre</p>
        <h1>{person.name}</h1>
        {person.note ? <p>{person.note}</p> : null}
      </header>

      {performing.length ? <RoleList title="On stage" roles={performing} /> : null}
      {creative.length ? <RoleList title="Behind it" roles={creative} /> : null}
      {!roles.length ? (
        <p className="profile-empty">No roles have been recorded for them yet.</p>
      ) : null}

      {yourNights.length ? (
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">You and them</p>
              <h2>
                {yourNights.length} {yourNights.length === 1 ? 'night' : 'nights'}
              </h2>
            </div>
          </div>
          <ul className="venue-nights">
            {yourNights.map((night) => (
              <li key={`${night.id}-${night.role}`}>
                <Link to="/outings/$id" params={{ id: night.id }}>
                  <strong>
                    {night.showTitle} · {night.role}
                  </strong>
                  <span>{formatFuzzyDate(night)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

function RoleList({
  title,
  roles,
}: {
  title: string
  roles: Awaited<ReturnType<typeof getPerson>>['roles']
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>
            {roles.length} {roles.length === 1 ? 'role' : 'roles'}
          </h2>
        </div>
      </div>
      <ul className="venue-productions">
        {roles.map((role) => (
          <li key={role.castingId}>
            <Link to="/shows/$slug" params={{ slug: role.showSlug }}>
              <ShowArtwork
                title={role.showTitle}
                type={role.showType}
                coverImageKey={role.coverImageKey}
              />
              <span>
                <strong>{role.role}</strong>
                <span>
                  {role.showTitle} · {role.productionName}
                </span>
                <span>{describeRun(role)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Only ever states what was recorded; an unknown run says so. */
function describeRun(role: { startedOn?: string | null; endedOn?: string | null }) {
  const from = role.startedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: role.startedOn })
    : null
  const to = role.endedOn
    ? formatFuzzyDate({ datePrecision: 'exact', occurredOn: role.endedOn })
    : null
  if (from && to) return `${from} — ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return 'Dates not recorded'
}
