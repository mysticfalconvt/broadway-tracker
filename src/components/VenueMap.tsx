import { useEffect, useRef } from 'react'

// Statically imported so the bundler extracts it into the stylesheet. Loaded
// alongside the dynamic `import('leaflet')` it was invisible to the build, and
// the map rendered unstyled.
import 'leaflet/dist/leaflet.css'

export type MappedVenue = {
  id: string
  name: string
  city: string | null
  latitude: number | null
  longitude: number | null
}

/**
 * A map of theatres, drawn only in the browser.
 *
 * Leaflet reaches for `window` on import, so it is loaded after mount rather
 * than at module scope — the server renders the fallback, and the map replaces
 * it. That fallback is not a spinner: a reader with no coordinates, or no
 * JavaScript, still gets the list of places, which is the actual information.
 *
 * Tiles come from OpenStreetMap's own servers, whose policy asks for clear
 * attribution on the map and for tiles to be fetched only as a reader actually
 * views them. Leaflet does both by default; nothing here pre-fetches.
 *
 * @see https://operations.osmfoundation.org/policies/tiles/
 */
export function VenueMap({ venues, height = '24rem' }: { venues: MappedVenue[]; height?: string }) {
  const container = useRef<HTMLDivElement | null>(null)
  const placed = venues.filter(
    (venue): venue is MappedVenue & { latitude: number; longitude: number } =>
      venue.latitude !== null && venue.longitude !== null,
  )

  useEffect(() => {
    if (!container.current || placed.length === 0) return
    let map: { remove: () => void } | null = null
    let cancelled = false

    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !container.current) return

      const instance = L.map(container.current, { scrollWheelZoom: false })
      map = instance
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(instance)

      const points: [number, number][] = []
      for (const venue of placed) {
        const point: [number, number] = [venue.latitude, venue.longitude]
        points.push(point)
        // A drawn circle rather than Leaflet's default marker: that one loads
        // its icon by relative URL, which no bundler resolves, so it arrives as
        // a broken image. This needs no asset at all.
        L.circleMarker(point, {
          radius: 7,
          weight: 2,
          color: '#8c2f39',
          fillColor: '#c25b66',
          fillOpacity: 0.9,
        })
          .addTo(instance)
          .bindPopup(
            `<strong>${escapeHtml(venue.name)}</strong>${
              venue.city ? `<br>${escapeHtml(venue.city)}` : ''
            }`,
          )
      }
      // One theatre gets a sensible zoom; several get a frame around them all.
      if (points.length === 1 && points[0]) instance.setView(points[0], 15)
      else instance.fitBounds(points, { padding: [32, 32] })
    })()

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [placed])

  if (placed.length === 0) {
    return (
      <p className="profile-empty">
        {venues.length ? 'Not found on a map yet.' : 'Nowhere to show yet.'}
      </p>
    )
  }

  return (
    <div className="venue-map-frame">
      <div className="venue-map" ref={container} style={{ height }} />
      <p className="venue-map-note">
        {placed.length} {placed.length === 1 ? 'place' : 'places'}
        {placed.length < venues.length
          ? ` · ${venues.length - placed.length} not found on a map`
          : ''}
      </p>
    </div>
  )
}

/** A venue name is member-entered text, and goes into a popup as markup. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
