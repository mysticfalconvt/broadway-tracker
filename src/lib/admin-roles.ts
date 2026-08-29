/**
 * Who administers the catalog, decided by deployment configuration rather than
 * by a script run against the production database.
 *
 * `ADMIN_EMAILS` is authoritative **when it is set**: an address on the list is
 * an administrator, and an address that is not is a member. That is the point of
 * putting it in the environment — removing somebody from the list has to
 * actually remove their access, or the list is only ever half the truth.
 *
 * When the variable is absent or empty nothing is enforced and whatever the
 * database already says stands, which keeps local development and the
 * `db:grant-admin` script working as they always have.
 */
export type Role = 'member' | 'admin'

/** Addresses are compared case-insensitively; separators may be commas or whitespace. */
export function parseAdminEmails(value: string | undefined | null): string[] {
  if (!value) return []
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isEnforcing(value: string | undefined | null): boolean {
  return parseAdminEmails(value).length > 0
}

/**
 * The role an account should carry. Returns null when nothing should change,
 * so callers can skip a pointless write.
 */
export function roleFor(
  email: string,
  currentRole: Role,
  adminEmails: string | undefined | null,
): Role | null {
  const list = parseAdminEmails(adminEmails)
  if (list.length === 0) return null
  const shouldBeAdmin = list.includes(email.trim().toLowerCase())
  const next: Role = shouldBeAdmin ? 'admin' : 'member'
  return next === currentRole ? null : next
}
