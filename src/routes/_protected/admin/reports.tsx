import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { getReports, markReportResolved } from '../../../server/report-functions'

export const Route = createFileRoute('/_protected/admin/reports')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  // Optional, so a link from elsewhere does not have to name it.
  validateSearch: (search: Record<string, unknown>): { include?: 'open' | 'all' } => ({
    include: search.include === 'all' ? 'all' : undefined,
  }),
  loaderDeps: ({ search }) => ({ include: search.include ?? 'open' }),
  loader: ({ deps }) => getReports({ data: { include: deps.include } }),
  component: Reports,
})

function Reports() {
  const reports = Route.useLoaderData()
  const include = Route.useSearch().include ?? 'open'
  const [error, setError] = useState<string | null>(null)

  async function setResolved(id: string, resolved: boolean) {
    try {
      await markReportResolved({ data: { id, resolved } })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'That did not work.')
    }
  }

  const open = reports.filter((report) => report.status === 'open').length

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Reports and ideas.</h1>
        <p>Sent by members from wherever they were in the app.</p>
      </header>

      {/* Resolved reports stay reachable: what has already been dealt with is
          how you tell whether a new one is the same thing again. */}
      <div className="report-filter" role="group" aria-label="Which reports to show">
        <Link to="/admin/reports" search={{}} data-selected={include === 'open'}>
          Open{include === 'open' ? ` (${open})` : ''}
        </Link>
        <Link to="/admin/reports" search={{ include: 'all' }} data-selected={include === 'all'}>
          Everything
        </Link>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {reports.length ? (
        <ul className="report-list">
          {reports.map((report) => (
            <li key={report.id} data-resolved={report.status === 'resolved'}>
              <div className="report-head">
                <span className={`report-kind report-kind-${report.kind}`}>
                  {report.kind === 'bug' ? 'Bug' : 'Idea'}
                </span>
                {report.status === 'resolved' ? (
                  <span className="report-kind report-kind-resolved">Resolved</span>
                ) : null}
                <span className="provenance">
                  {report.reporterName} · {new Date(report.createdAt).toISOString().slice(0, 10)}
                  {report.path ? ` · ${report.path}` : ''}
                  {report.resolvedByName
                    ? ` · resolved by ${report.resolvedByName}${
                        report.resolvedAt
                          ? ` on ${new Date(report.resolvedAt).toISOString().slice(0, 10)}`
                          : ''
                      }`
                    : ''}
                </span>
              </div>
              <p className="report-message">{report.message}</p>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => void setResolved(report.id, report.status === 'open')}
              >
                {report.status === 'open' ? 'Mark resolved' : 'Reopen'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">
          {include === 'open'
            ? 'Nothing open. Members can send a report from any page.'
            : 'Nothing has been reported yet.'}
        </p>
      )}
    </main>
  )
}
