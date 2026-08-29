import { Link, createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import {
  getMyFriends,
  removeFriendship,
  respondToFriendRequest,
  searchPeople,
  sendFriendRequest,
} from '../../server/friend-functions'

export const Route = createFileRoute('/_protected/friends')({
  loader: () => getMyFriends(),
  component: Friends,
})

function Friends() {
  const friendships = Route.useLoaderData()
  const [message, setMessage] = useState<string | null>(null)
  const [foundPerson, setFoundPerson] = useState<{
    id: string
    name: string
    handle: string
  } | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFoundPerson(null)
    const handle = String(new FormData(event.currentTarget).get('handle')).trim()
    try {
      const people = await searchPeople({ data: { handle } })
      setFoundPerson(people[0] ?? null)
      if (!people.length) setMessage('No person was found with that handle.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed.')
    }
  }

  async function act(action: () => Promise<unknown>) {
    setMessage(null)
    try {
      await action()
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That action could not be completed.')
    }
  }

  const accepted = friendships.filter((friendship) => friendship.status === 'accepted')
  const incoming = friendships.filter(
    (friendship) => friendship.status === 'pending' && friendship.isIncoming,
  )
  const outgoing = friendships.filter(
    (friendship) => friendship.status === 'pending' && !friendship.isIncoming,
  )
  return (
    <main className="lists-page page-wrap">
      <header className="settings-header">
        <p className="eyebrow">My theatre</p>
        <h1>Friends in the house.</h1>
        <p>Connect by handle to share friends-visible lists and theatre plans.</p>
      </header>
      <form className="settings-form" onSubmit={search}>
        <label>
          Find by handle
          <input name="handle" required placeholder="theatrelover" autoComplete="off" />
        </label>
        <button className="button button-primary" type="submit">
          Find person
        </button>
      </form>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {foundPerson ? (
        <section className="list-index">
          <article>
            <h2>{foundPerson.name}</h2>
            <p>@{foundPerson.handle}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => act(() => sendFriendRequest({ data: { userId: foundPerson.id } }))}
            >
              Send friend request
            </button>
          </article>
        </section>
      ) : null}
      <FriendSection title="Friend requests" friends={incoming} empty="No incoming requests.">
        {(friendship) => (
          <>
            <button
              className="button button-primary"
              type="button"
              onClick={() =>
                act(() =>
                  respondToFriendRequest({ data: { userId: friendship.person.id, accept: true } }),
                )
              }
            >
              Accept
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                act(() =>
                  respondToFriendRequest({ data: { userId: friendship.person.id, accept: false } }),
                )
              }
            >
              Decline
            </button>
          </>
        )}
      </FriendSection>
      <FriendSection
        title="Your friends"
        friends={accepted}
        empty="Find someone by handle to start sharing."
      >
        {(friendship) => (
          <>
            {/* Offering a link to a profile its owner keeps private produces an
                error page; say so instead. */}
            {friendship.person.profileVisibility === 'private' ? (
              <span className="friend-private">Keeps their theatre private</span>
            ) : (
              <Link
                className="button button-primary"
                to="/people/$handle"
                params={{ handle: friendship.person.handle }}
              >
                View theatre
              </Link>
            )}
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                act(() => removeFriendship({ data: { userId: friendship.person.id } }))
              }
            >
              Remove
            </button>
          </>
        )}
      </FriendSection>
      <FriendSection title="Sent requests" friends={outgoing} empty="No pending requests.">
        {(friendship) => (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => act(() => removeFriendship({ data: { userId: friendship.person.id } }))}
          >
            Cancel request
          </button>
        )}
      </FriendSection>
    </main>
  )
}

type Friendship = ReturnType<typeof Route.useLoaderData>[number]

function FriendSection({
  title,
  friends,
  empty,
  children,
}: {
  title: string
  friends: Friendship[]
  empty: string
  children: (friendship: Friendship) => React.ReactNode
}) {
  return (
    <section className="profile-favorites">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      {friends.length ? (
        <div className="list-index">
          {friends.map((friendship) => (
            <article key={friendship.person.id}>
              <h3>{friendship.person.name}</h3>
              <p>@{friendship.person.handle}</p>
              <div className="button-row">{children(friendship)}</div>
            </article>
          ))}
        </div>
      ) : (
        <p className="profile-empty">{empty}</p>
      )}
    </section>
  )
}
