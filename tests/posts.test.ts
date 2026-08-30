import { beforeEach, describe, expect, it } from 'vitest'

import { createOutingForUser, updateMyReaction } from '../src/server/outing-functions'
import {
  createPostForAuthor,
  deletePost,
  pieceFromReview,
  postForReader,
  postsAbout,
  postsByAuthor,
  postsForReader,
  publishPost,
  unpublishPost,
  updatePost,
} from '../src/server/post-functions'
import { makeAdmin, makeFriendship, makeShow, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role }) as never
const openly = () => makeUser({ profileVisibility: 'public' })

async function aPiece(author: { id: string }, overrides = {}) {
  return createPostForAuthor(author.id, {
    title: 'A night at the Kerr',
    body: 'The turntable alone was worth the ticket.',
    ...overrides,
  })
}

describe('drafts', () => {
  it('starts unpublished, so starting is not publishing', async () => {
    const author = await openly()
    await aPiece(author)
    const mine = await postsByAuthor(author.id)
    expect(mine[0]?.status).toBe('draft')
    expect(await postsForReader(author.id)).toHaveLength(0)
  })

  it('is invisible to everybody but its author, however open its visibility', async () => {
    const author = await openly()
    const reader = await openly()
    await makeFriendship(author.id, reader.id, 'accepted')
    const piece = await aPiece(author, { visibility: 'public' })
    expect(await postForReader(reader.id, piece.slug)).toBeNull()
    expect(await postForReader(null, piece.slug)).toBeNull()
    expect((await postForReader(author.id, piece.slug))?.title).toBe('A night at the Kerr')
  })

  it('appears once published, and goes away again when withdrawn', async () => {
    const author = await openly()
    const reader = await openly()
    const piece = await aPiece(author, { visibility: 'public' })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    expect((await postForReader(reader.id, piece.slug))?.title).toBe('A night at the Kerr')
    await unpublishPost(actor({ ...author, role: 'member' }), piece.id)
    expect(await postForReader(reader.id, piece.slug)).toBeNull()
  })

  it('keeps its first publication date through a withdrawal and a correction', async () => {
    const author = await openly()
    const piece = await aPiece(author)
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    const [first] = await postsByAuthor(author.id)
    await unpublishPost(actor({ ...author, role: 'member' }), piece.id)
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    const [again] = await postsByAuthor(author.id)
    expect(again?.publishedAt).toEqual(first?.publishedAt)
  })
})

describe('who may read a published piece', () => {
  async function published(visibility: 'private' | 'friends' | 'public') {
    const author = await openly()
    const piece = await aPiece(author, { visibility })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    return { author, piece }
  }

  it('lets anybody at all read a public one, signed in or not', async () => {
    const { piece } = await published('public')
    expect((await postForReader(null, piece.slug))?.title).toBe('A night at the Kerr')
  })

  it('lets a friend read a friends-only one', async () => {
    const { author, piece } = await published('friends')
    const friend = await openly()
    await makeFriendship(author.id, friend.id, 'accepted')
    expect(await postForReader(friend.id, piece.slug)).not.toBeNull()
  })

  it('refuses a stranger a friends-only one', async () => {
    const { piece } = await published('friends')
    const stranger = await openly()
    expect(await postForReader(stranger.id, piece.slug)).toBeNull()
    expect(await postForReader(null, piece.slug)).toBeNull()
  })

  it('refuses everybody but the author a private one', async () => {
    const { author, piece } = await published('private')
    const friend = await openly()
    await makeFriendship(author.id, friend.id, 'accepted')
    expect(await postForReader(friend.id, piece.slug)).toBeNull()
    expect(await postForReader(author.id, piece.slug)).not.toBeNull()
  })
})

describe('the byline', () => {
  it('never hands a reader the author’s account name', async () => {
    // A public profile carries no name by design. Publishing an essay must not
    // quietly attach one to everything else that person marked public.
    const author = await makeUser({ name: 'Rosalind Vance', profileVisibility: 'public' })
    const piece = await aPiece(author, { visibility: 'public', byline: 'R. Vance' })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    const read = await postForReader(null, piece.slug)
    expect(read?.byline).toBe('R. Vance')
    expect(read?.authorName).toBeNull()
  })

  it('tells the author it is theirs', async () => {
    const author = await openly()
    const piece = await aPiece(author, { visibility: 'public' })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    const read = await postForReader(author.id, piece.slug)
    expect(read?.isMine).toBe(true)
    expect(read?.authorName).toBe(author.name)
  })

  it('publishes unsigned when nobody chose a name', async () => {
    const author = await openly()
    const piece = await aPiece(author, { visibility: 'public' })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    expect((await postForReader(null, piece.slug))?.byline).toBeNull()
  })
})

describe('a piece is about something', () => {
  it('turns up on the page of the show it concerns', async () => {
    const author = await openly()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const other = await makeShow({ title: 'Six', slug: 'six' })
    const piece = await aPiece(author, { visibility: 'public', showId: show.id })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)

    expect((await postsAbout(null, { showId: show.id })).map((p) => p.title)).toEqual([
      'A night at the Kerr',
    ])
    expect(await postsAbout(null, { showId: other.id })).toHaveLength(0)
  })

  it('does not leak a friends-only piece onto a public show page', async () => {
    const author = await openly()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const piece = await aPiece(author, { visibility: 'friends', showId: show.id })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    expect(await postsAbout(null, { showId: show.id })).toHaveLength(0)
  })

  it('keeps a draft off the show page', async () => {
    const author = await openly()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    await aPiece(author, { visibility: 'public', showId: show.id })
    expect(await postsAbout(null, { showId: show.id })).toHaveLength(0)
  })
})

describe('editing and removing', () => {
  it('refuses somebody else’s piece, and says nothing about its existence', async () => {
    const author = await openly()
    const stranger = await openly()
    const piece = await aPiece(author)
    await expect(
      updatePost(actor({ ...stranger, role: 'member' }), piece.id, {
        title: 'Mine now',
        body: 'No.',
      }),
    ).rejects.toThrow('not here')
    await expect(deletePost(actor({ ...stranger, role: 'member' }), piece.id)).rejects.toThrow(
      'not here',
    )
  })

  it('lets an administrator withdraw something', async () => {
    const author = await openly()
    const admin = await makeAdmin()
    const piece = await aPiece(author, { visibility: 'public' })
    await publishPost(actor({ ...author, role: 'member' }), piece.id)
    await unpublishPost(actor(admin), piece.id)
    expect(await postForReader(null, piece.slug)).toBeNull()
  })

  it('gives two pieces of the same name their own addresses', async () => {
    const author = await openly()
    const first = await aPiece(author)
    const second = await aPiece(author)
    expect(second.slug).not.toBe(first.slug)
  })
})

describe('a review that outgrew its box', () => {
  async function reviewed(review: string) {
    const author = await openly()
    const show = await makeShow({ title: 'Hadestown', slug: 'hadestown' })
    const outing = await createOutingForUser(author.id, {
      showId: show.id,
      datePrecision: 'exact',
      occurredOn: '2026-05-18',
      attendeeIds: [],
      favorite: false,
    })
    if (review) {
      await updateMyReaction(author.id, {
        outingId: outing.id,
        favorite: false,
        review,
        reviewVisibility: 'public',
      })
    }
    return { author, show, outing }
  }

  it('opens a draft holding the review, and leaves the review alone', async () => {
    const { author, outing } = await reviewed('The turntable alone was worth it.')
    const piece = await pieceFromReview(author.id, outing.id)
    const draft = await postForReader(author.id, piece.slug)
    expect(draft?.body).toBe('The turntable alone was worth it.')
    expect(draft?.status).toBe('draft')
    // The review is still on the night where it was written.
    const { outingForViewer } = await import('../src/server/outing-functions')
    const night = await outingForViewer(author.id, outing.id)
    expect(night.attendees[0]?.review).toBe('The turntable alone was worth it.')
  })

  it('attaches it to the show and the night it came from', async () => {
    const { author, show, outing } = await reviewed('Wonderful.')
    const piece = await pieceFromReview(author.id, outing.id)
    const draft = await postForReader(author.id, piece.slug)
    expect(draft?.showId).toBe(show.id)
    expect(draft?.outingId).toBe(outing.id)
  })

  it('refuses when there is no review yet', async () => {
    const { author, outing } = await reviewed('')
    await expect(pieceFromReview(author.id, outing.id)).rejects.toThrow('no review')
  })

  it('refuses somebody else’s night', async () => {
    const { outing } = await reviewed('Wonderful.')
    const stranger = await openly()
    await expect(pieceFromReview(stranger.id, outing.id)).rejects.toThrow('not yours')
  })
})
