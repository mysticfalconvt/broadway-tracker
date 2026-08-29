import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

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
            {preview.venues} standalone venue{preview.venues === 1 ? '' : 's'}
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
