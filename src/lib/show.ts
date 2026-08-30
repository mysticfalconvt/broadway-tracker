/**
 * Normalisation for the title of a work that exists nowhere but one town.
 *
 * Deliberately looser than the catalog's own comparison: two parents naming
 * their school's devised piece will disagree about a leading article and about
 * punctuation, and there is no published record to settle it. Folding "The
 * Millbrook Revue" into "Millbrook Revue" is right here, where the venue keys
 * the record too, and would be wrong in the shared catalog, where "The Wiz" and
 * "Wiz" could be different works.
 */
export function localTitleKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ')
}
