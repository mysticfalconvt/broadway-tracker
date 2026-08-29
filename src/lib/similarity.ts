/**
 * Near-duplicate detection for catalog records.
 *
 * Exact duplicates are already prevented — venues by their unique match key,
 * shows by their slug. What survives is human variation a normaliser cannot
 * catch: a typo, a missing word, a different subtitle. This scores those pairs
 * so an administrator can look at the few that are probably the same thing,
 * rather than reading the whole catalog.
 */

/** Levenshtein distance, iterative with a single row of state. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      const deletion = (previous[j] ?? 0) + 1
      const insertion = (current[j - 1] ?? 0) + 1
      current[j] = Math.min(substitution, deletion, insertion)
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/** 1 for identical strings, 0 for entirely different ones. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - editDistance(a, b) / longest
}

export type SuspectPair<T> = { a: T; b: T; score: number }

/**
 * Pairs whose keys look close enough to be worth a look. Quadratic, which is
 * fine for a hand-curated catalog and would need revisiting at a scale this
 * product is not built for.
 */
export function findSuspectPairs<T>(
  items: T[],
  key: (item: T) => string,
  threshold = 0.82,
): SuspectPair<T>[] {
  const pairs: SuspectPair<T>[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i] as T
      const b = items[j] as T
      const score = similarity(key(a), key(b))
      if (score >= threshold && score < 1) pairs.push({ a, b, score })
    }
  }
  return pairs.sort((x, y) => y.score - x.score)
}
