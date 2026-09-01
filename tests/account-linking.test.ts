import { beforeEach, describe, expect, it } from 'vitest'

import { account } from '../src/server/db/schema'
import { disconnectWayIn, waysToSignIn } from '../src/server/social-functions'
import { db, makeUser, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function giveThem(userId: string, providerId: string, withPassword = false) {
  const [row] = await db
    .insert(account)
    .values({
      id: `${userId}-${providerId}`,
      accountId: `${providerId}-${userId}`,
      issuer: providerId,
      providerId,
      userId,
      password: withPassword ? 'hashed' : null,
    })
    .returning()
  return row!
}

describe('the ways somebody can get back in', () => {
  it('lists a password and a provider side by side', async () => {
    // One account, two doors, and different addresses behind them — which is
    // the ordinary case for anybody who keeps a Google account for logging in.
    const member = await makeUser({ email: 'me@myown.test' })
    await giveThem(member.id, 'credential', true)
    await giveThem(member.id, 'google')

    const ways = await waysToSignIn(member.id)
    expect(ways.map((way) => way.providerId)).toEqual(['credential', 'google'])
    expect(ways[0]?.hasPassword).toBe(true)
    expect(ways[1]?.hasPassword).toBe(false)
  })

  it('never hands back the stored password', async () => {
    const member = await makeUser()
    await giveThem(member.id, 'credential', true)
    expect(JSON.stringify(await waysToSignIn(member.id))).not.toContain('hashed')
  })

  it('shows only your own', async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    await giveThem(member.id, 'credential', true)
    await giveThem(stranger.id, 'google')
    expect(await waysToSignIn(member.id)).toHaveLength(1)
  })
})

describe('removing a way in', () => {
  it('removes one when another remains', async () => {
    const member = await makeUser()
    await giveThem(member.id, 'credential', true)
    const google = await giveThem(member.id, 'google')

    const gone = await disconnectWayIn(member.id, google.id)
    expect(gone.removed).toBe('google')
    expect(await waysToSignIn(member.id)).toHaveLength(1)
  })

  it('refuses to remove the last one', async () => {
    // The consequence is not "a provider is disconnected". It is somebody shut
    // out of a decade of their own evenings, with the account still there and
    // no door left in it.
    const member = await makeUser()
    const only = await giveThem(member.id, 'google')

    await expect(disconnectWayIn(member.id, only.id)).rejects.toThrow(/only way you can sign in/i)
    expect(await waysToSignIn(member.id)).toHaveLength(1)
  })

  it("will not remove somebody else's", async () => {
    const member = await makeUser()
    const stranger = await makeUser()
    await giveThem(member.id, 'credential', true)
    await giveThem(member.id, 'google')
    const theirs = await giveThem(stranger.id, 'google')
    await giveThem(stranger.id, 'credential', true)

    await expect(disconnectWayIn(member.id, theirs.id)).rejects.toThrow(/not one of your/i)
    expect(await waysToSignIn(stranger.id)).toHaveLength(2)
  })
})
