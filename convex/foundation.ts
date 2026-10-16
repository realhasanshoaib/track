import { query } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'

export const getActorContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthenticatedActor(ctx)
    return {
      authSubject: actor.authSubject,
      userId: actor.userId,
    }
  },
})
