export const TIER_LABELS = ['S', 'A', 'B', 'C', 'D'] as const
export type TierLabel = (typeof TIER_LABELS)[number]
export const DEFAULT_TIER_NAMES: Record<TierLabel, string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
}
