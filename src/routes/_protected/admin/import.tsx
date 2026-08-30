import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { applyVenueFix, applyVenueFixes, type VenueFix } from '../../../lib/import-fix'
import { checkCatalogImport, runCatalogImport } from '../../../server/import-functions'

export const Route = createFileRoute('/_protected/admin/import')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  component: ImportCatalog,
})

type Preview = Awaited<ReturnType<typeof checkCatalogImport>>
type Result = Awaited<ReturnType<typeof runCatalogImport>>

const EXAMPLE = `{
  "shows": [
    {
      "title": "Hadestown",
      "type": "musical",
      "synopsis": "A folk opera retelling of Orpheus and Eurydice.",
      "productions": [
        {
          "name": "Original Broadway",
          "productionType": "broadway",
          "venue": "Walter Kerr Theatre",
          "city": "New York",
          "openedOn": "2019-04-17"
        }
      ]
    }
  ]
}`

function describe(reason: 'no-city' | 'other-city' | 'near-miss') {
  if (reason === 'no-city') return 'No city given, so this would become a second venue'
  if (reason === 'other-city')
    return 'Same name, different city — check these are not the same place'
  return 'Close to an existing name; likely the same theatre'
}

function toFix(warning: {
  given: string
  city: string | null
  resembles: string
  resemblesCity: string | null
}): VenueFix {
  return {
    given: warning.given,
    city: warning.city,
    name: warning.resembles,
    venueCity: warning.resemblesCity,
  }
}

function ImportCatalog() {
  const [json, setJson] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function check() {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      setPreview(await checkCatalogImport({ data: { json } }))
    } catch (caughtError) {
      setPreview(null)
      setError(caughtError instanceof Error ? caughtError.message : 'That could not be read.')
    } finally {
      setBusy(false)
    }
  }

  /** Rewrites the pasted JSON, then re-checks so the report stays truthful. */
  function applyFix(fix: VenueFix) {
    try {
      setJson(applyVenueFix(json, fix))
      setPreview(null)
      setError('Venue corrected in the JSON below. Check it again to confirm.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not apply that.')
    }
  }

  function applyAll(fixes: VenueFix[]) {
    try {
      setJson(applyVenueFixes(json, fixes))
      setPreview(null)
      setError(`${fixes.length} venues corrected below. Check it again to confirm.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not apply those.')
    }
  }

  async function run() {
    setError(null)
    setBusy(true)
    try {
      setResult(await runCatalogImport({ data: { json } }))
      setPreview(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Add catalog data.</h1>
        <p>
          Paste JSON to add shows, their productions, and venues at once. The format is documented
          in <code>docs/catalog-import.md</code>, which is written to be handed to a language model
          as-is. Nothing existing is overwritten, so the same paste can safely be run twice.
        </p>
      </header>

      <label className="import-field">
        Catalog JSON
        <textarea
          value={json}
          rows={16}
          spellCheck={false}
          placeholder={EXAMPLE}
          onChange={(event) => {
            setJson(event.target.value)
            setPreview(null)
            setResult(null)
          }}
        />
      </label>

      <div className="settings-actions">
        <button
          className="button button-quiet"
          type="button"
          disabled={busy || json.trim().length < 2}
          onClick={() => void check()}
        >
          Check it
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy || !preview}
          onClick={() => void run()}
        >
          {busy ? 'Working…' : 'Import'}
        </button>
        {!preview && !result ? (
          <span className="settings-note">Check the JSON before it can be imported.</span>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {preview && preview.venueWarnings.length ? (
        <section className="import-report import-warnings">
          <h2>
            {preview.venueWarnings.length} venue
            {preview.venueWarnings.length === 1 ? '' : 's'} to look at
          </h2>
          <p className="settings-note">
            These resemble a venue already in the catalog. Importing as-is makes a second one.
          </p>
          <ul className="warning-list">
            {preview.venueWarnings.map((warning) => (
              <li key={`${warning.given}-${warning.city ?? ''}-${warning.resembles}`}>
                <div>
                  <strong>
                    {warning.given}
                    {warning.city ? ` · ${warning.city}` : ''}
                  </strong>
                  <span>{describe(warning.reason)}</span>
                  <span className="warning-existing">
                    Existing: {warning.resembles}
                    {warning.resemblesCity ? ` · ${warning.resemblesCity}` : ''}
                  </span>
                </div>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => applyFix(toFix(warning))}
                >
                  Use the existing one
                </button>
              </li>
            ))}
          </ul>
          {preview.venueWarnings.length > 1 ? (
            <button
              className="button button-quiet"
              type="button"
              onClick={() => applyAll(preview.venueWarnings.map(toFix))}
            >
              Use the existing venue for all {preview.venueWarnings.length}
            </button>
          ) : null}
        </section>
      ) : null}

      {preview && preview.peopleWarnings.length ? (
        <section className="import-report import-warnings">
          <h2>
            {preview.peopleWarnings.length} {preview.peopleWarnings.length === 1 ? 'name' : 'names'}{' '}
            to look at
          </h2>
          <p className="settings-note">
            Names are matched strictly, so a misspelling becomes a second person rather than joining
            the first.
          </p>
          <ul className="warning-list">
            {preview.peopleWarnings.map((warning) => (
              <li key={warning.given}>
                <div>
                  <strong>{warning.given}</strong>
                  <span className="warning-existing">Already recorded: {warning.resembles}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview ? (
        <section className="import-report">
          <h2>This would add</h2>
          <ul>
            {preview.shows.map((show) => (
              <li key={show.slug}>
                <strong>{show.title}</strong>{' '}
                <span className={show.exists ? 'import-skip' : 'import-new'}>
                  {show.exists ? 'already in the catalog — will be skipped' : `new · ${show.slug}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="settings-note">
            {preview.productions} production{preview.productions === 1 ? '' : 's'} ·{' '}
            {preview.venues} standalone venue{preview.venues === 1 ? '' : 's'} · {preview.castings}{' '}
            casting{preview.castings === 1 ? '' : 's'}
          </p>
        </section>
      ) : null}

      {result ? (
        <section className="import-report">
          <h2>Imported</h2>
          <ul>
            {result.shows.map((show) => (
              <li key={show.slug}>
                <strong>{show.title}</strong>{' '}
                <span className={show.status === 'created' ? 'import-new' : 'import-skip'}>
                  {show.status === 'created' ? `added · ${show.slug}` : (show.reason ?? 'skipped')}
                </span>
              </li>
            ))}
          </ul>
          <p className="settings-note">
            {result.productions} production{result.productions === 1 ? '' : 's'} and {result.venues}{' '}
            venue reference{result.venues === 1 ? '' : 's'} recorded.
          </p>
        </section>
      ) : null}
    </main>
  )
}
