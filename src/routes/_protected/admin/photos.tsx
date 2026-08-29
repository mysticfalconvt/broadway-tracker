import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { decideShowPhoto, getPendingShowPhotos } from '../../../server/image-functions'

export const Route = createFileRoute('/_protected/admin/photos')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => getPendingShowPhotos(),
  component: PhotoReview,
})

function PhotoReview() {
  const photos = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)

  async function decide(id: string, approve: boolean) {
    try {
      await decideShowPhoto({ data: { id, approve } })
      window.location.reload()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'That did not work.')
    }
  }

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Photographs awaiting review.</h1>
        <p>
          These were offered publicly. Until approved they are visible only to the person who
          uploaded them and their approved friends.
        </p>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {photos.length ? (
        <ul className="photo-grid review-grid">
          {photos.map((photo) => (
            <li key={photo.id}>
              <img src={`/api/images/${photo.objectKey}`} alt="" loading="lazy" decoding="async" />
              <div className="photo-meta">
                <span>
                  <strong>{photo.showTitle}</strong> · {photo.uploaderName}
                </span>
              </div>
              <div className="review-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => void decide(photo.id, true)}
                >
                  Approve
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => void decide(photo.id, false)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">
          Nothing is waiting. Approved photographs appear on their show.
        </p>
      )}
    </main>
  )
}
