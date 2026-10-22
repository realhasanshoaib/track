import { mutation } from './_generated/server'
import { requireAuthenticatedActor } from './lib/actorContext'
export const seedLaunchWeek = mutation({
 args: {},
 handler: async ctx => {
  if (process.env.DEV_AUTH_BYPASS !== '1') throw new Error('demo_seed_requires_dev_auth_bypass')
  const actor = await requireAuthenticatedActor(ctx)
  const existing = await ctx.db.query('groups').collect()
  const group = existing.find(g => g.createdBy === actor.userId && g.name === 'Launch week')
  if (group) return group._id
  const now = Date.now()
  const groupId = await ctx.db.insert('groups', { name: 'Launch week', status: 'active', nextChannelSequence: 2, createdBy: actor.userId, createdAt: now, updatedAt: now })
  await ctx.db.insert('groupMembers', { groupId, userId: actor.userId, status: 'active', createdAt: now, updatedAt: now })
  await ctx.db.insert('messages', { groupId, authorId: actor.userId, body: 'Keep the launch conversation here. Invite a teammate to get started.', channelSequence: 1, mentions: [], attachmentIds: [], createdAt: now })
  return groupId
 },
})
