import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { ShowArtwork } from './ShowArtwork'
import { TIER_LABELS, type TierLabel } from '../lib/tier-list'

type Card = {
  showId: string
  title: string
  slug: string
  type: string
  coverImageKey: string | null
  tier?: TierLabel | null
  productionTypes: string[]
}

const FILTERS = [
  ['broadway', 'Broadway'],
  ['off_broadway', 'Off-Broadway'],
  ['tour', 'Tour'],
  ['regional', 'Regional'],
  ['local', 'Local'],
  ['other', 'Other'],
] as const

function matches(card: Card, filters: string[]) {
  return filters.length === 0 || card.productionTypes.some((type) => filters.includes(type))
}

function DropRow({ tier, children }: { tier: TierLabel | null; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `drop-${tier ?? 'unranked'}`, data: { tier } })
  return <div ref={setNodeRef}>{children}</div>
}

function SortableCard({ card, editable }: { card: Card; editable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.showId,
    data: { tier: card.tier ?? null },
    disabled: !editable,
  })
  return (
    <article
      ref={setNodeRef}
      className={`tier-card${isDragging ? ' tier-card-dragging' : ''}`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      {...(editable ? attributes : {})}
      {...(editable ? listeners : {})}
    >
      <CardContents card={card} />
    </article>
  )
}

function CardContents({ card }: { card: Card }) {
  return (
    <Link to="/shows/$slug" params={{ slug: card.slug }}>
      <ShowArtwork
        title={card.title}
        type={card.type}
        coverImageKey={card.coverImageKey}
        width={320}
      />
      <span>{card.title}</span>
    </Link>
  )
}

export function TierBoard({
  items,
  candidates,
  tierNames,
  editable,
  onPlace,
}: {
  items: Card[]
  candidates: Card[]
  tierNames: Record<TierLabel, string>
  editable: boolean
  onPlace: (showId: string, tier: TierLabel | null, index: number) => Promise<void>
}) {
  const [filters, setFilters] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const availableCandidates = candidates.filter(
    (candidate) => !items.some((item) => item.showId === candidate.showId),
  )
  // A card remains visible in Unranked after it has been added but before it has
  // been dropped into S-D. New candidates are shown there alongside it.
  const unranked = [
    ...items.filter((item) => item.tier === null || item.tier === undefined),
    ...availableCandidates,
  ]
  const cards = [...items, ...availableCandidates]

  async function dragEnd(event: DragEndEvent) {
    const { active, over } = event
    setDraggingId(null)
    if (!over || active.id === over.id) return
    const card = cards.find((entry) => entry.showId === active.id)
    if (!card) return
    const targetTier = (over.data.current?.tier ?? null) as TierLabel | null
    const withinTier =
      targetTier === null ? unranked : items.filter((entry) => entry.tier === targetTier)
    const target = withinTier.findIndex((entry) => entry.showId === over.id)
    await onPlace(card.showId, targetTier, target < 0 ? withinTier.length : target)
  }

  return (
    <section className="tier-board" aria-label="Tier list">
      <fieldset className="tier-filters">
        <legend>Show types</legend>
        <button
          className={filters.length === 0 ? 'is-selected' : ''}
          type="button"
          onClick={() => setFilters([])}
        >
          All
        </button>
        {FILTERS.map(([value, label]) => (
          <button
            className={filters.includes(value) ? 'is-selected' : ''}
            type="button"
            key={value}
            onClick={() =>
              setFilters((current) =>
                current.includes(value)
                  ? current.filter((item) => item !== value)
                  : [...current, value],
              )
            }
          >
            {label}
          </button>
        ))}
      </fieldset>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDraggingId(String(active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={dragEnd}
      >
        <div className="tier-rows">
          {TIER_LABELS.map((tier) => {
            const tierCards = items.filter((item) => item.tier === tier && matches(item, filters))
            return (
              <div className={`tier-row tier-${tier.toLowerCase()}`} key={tier}>
                <h2>{tierNames[tier]}</h2>
                <DropRow tier={tier}>
                  <SortableContext
                    items={tierCards.map((item) => item.showId)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="tier-cards">
                      {tierCards.map((card) => (
                        <div key={card.showId} className="tier-card-wrap">
                          <SortableCard card={card} editable={editable} />
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DropRow>
              </div>
            )
          })}
          {editable ? (
            <div className="tier-row tier-unranked">
              <h2>Unranked</h2>
              <DropRow tier={null}>
                <SortableContext
                  items={unranked
                    .filter((item) => matches(item, filters))
                    .map((item) => item.showId)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="tier-cards">
                    {unranked
                      .filter((item) => matches(item, filters))
                      .map((card) => (
                        <div key={card.showId} className="tier-card-wrap">
                          <SortableCard card={card} editable />
                        </div>
                      ))}
                  </div>
                </SortableContext>
              </DropRow>
            </div>
          ) : null}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggingId
            ? (() => {
                const card = cards.find((entry) => entry.showId === draggingId)
                return card ? (
                  <article className="tier-card tier-card-overlay">
                    <CardContents card={card} />
                  </article>
                ) : null
              })()
            : null}
        </DragOverlay>
      </DndContext>
      {editable ? (
        <p className="tier-board-note">
          Drag a show into a tier. Filters only change what you see.
        </p>
      ) : null}
    </section>
  )
}
