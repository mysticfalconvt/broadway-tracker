import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getMembersForAdmin } from '../../../server/admin-functions'
import { startViewingAs } from '../../../server/session'

export const Route = createFileRoute('/_protected/admin/members')({
  beforeLoad: ({ context }) => {
    if (context.user.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: async () => ({ members: await getMembersForAdmin() }),
  component: MemberAdmin,
})

type Member = Awaited<ReturnType<typeof getMembersForAdmin>>[number]

function day(value: Date | string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : '—'
}

/** "3 nights · 2 shows · 1 piece", leaving out whatever is zero. */
function activity(member: Member) {
  const parts: string[] = []
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  add(member.nights, 'night', 'nights')
  add(member.shows, 'show', 'shows')
  add(member.friends, 'friend', 'friends')
  add(member.lists, 'list', 'lists')
  add(member.pieces, 'piece', 'pieces')
  add(member.photographs, 'photograph', 'photographs')
  return parts.join(' · ') || 'nothing recorded'
}

function MemberAdmin() {
  const { members } = Route.useLoaderData()
  const [filter, setFilter] = useState('')

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return members
    return members.filter((member) =>
      [member.name, member.handle, member.email].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    )
  }, [members, filter])

  const active = members.filter(
    (member) =>
      member.lastActiveAt && Date.now() - new Date(member.lastActiveAt).getTime() < 30 * 86_400_000,
  ).length
  const dormant = members.filter((member) => member.nights === 0).length

  return (
    <main className="admin-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">Administration</p>
        <h1>Members.</h1>
        <p>
          {members.length} {members.length === 1 ? 'account' : 'accounts'} · {active} here in the
          last month · {dormant} with nothing logged
        </p>
      </header>

      <label className="people-filter">
        Find somebody
        <input
          onChange={(event) => setFilter(event.target.value)}
          placeholder="A name, a handle, an address"
          type="search"
          value={filter}
        />
      </label>

      {shown.length ? (
        <ul className="member-list">
          {shown.map((member) => (
            <li key={member.id}>
              <div className="member-who">
                <strong>{member.name}</strong>
                <span>@{member.handle}</span>
                <span>{member.email}</span>
              </div>
              <div className="member-facts">
                {member.role === 'admin' ? null : (
                  <button
                    className="button button-quiet"
                    onClick={async () => {
                      await startViewingAs({ data: { userId: member.id } })
                      window.location.assign('/')
                    }}
                    type="button"
                  >
                    Look as {member.name.split(' ')[0]}
                  </button>
                )}
                <span>{activity(member)}</span>
                <span>
                  joined {day(member.createdAt)} · last here {day(member.lastActiveAt)}
                </span>
                <span>
                  {member.role === 'admin' ? 'administrator · ' : ''}
                  shares {member.profileVisibility} · letters {member.digestCadence}
                  {member.emailVerified ? '' : ' · address unconfirmed'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-empty">Nobody by that name.</p>
      )}
    </main>
  )
}
