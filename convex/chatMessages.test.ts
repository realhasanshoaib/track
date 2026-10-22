/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.test.{ts,js}'])
type TestBackend = ReturnType<typeof convexTest>
describe('Channel messages', () => {
  it('returns bounded Channel context around an older target message', async () => {
    const { groupId, owner, t } = await seedGroup()
    const actor = asUser(t, owner)
    const messageIds: Array<Id<'messages'>> = []
    for (const [index, body] of ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].entries()) {
      messageIds.push(
        await actor.mutation(api.messages.send, {
          authorId: owner,
          body,
          groupId,
          idempotencyKey: `bounded-history-${index}`,

        }),
      )
    }
    const page = await actor.query(api.messages.listPage, {
      groupId,
      userId: owner,
      targetMessageId: messageIds[2],
      paginationOpts: { cursor: null, numItems: 5 },
    })
    const pageIds = page.page.map((item) => item.message._id)
    expect(pageIds).toContain(messageIds[2])
    expect(pageIds.length).toBeLessThanOrEqual(5)
    expect(pageIds).toEqual(expect.arrayContaining([messageIds[1], messageIds[3]]))
  })
  it('hydrates a quote outside the latest page and loads its original on demand', async () => {
    const { groupId, owner, t } = await seedGroup()
    const actor = asUser(t, owner)
    const originalId = await t.run(async (ctx) => {
      let original: Id<'messages'> | undefined
      for (let index = 0; index < 150; index += 1) {
        const id = await ctx.db.insert('messages', {

          groupId,
          authorId: owner,
          body: `History ${index}`,
          mentions: [],
          attachmentIds: [],
          channelSequence: index + 1,
          createdAt: Date.now() - 1000 + index,
        })
        original ??= id
      }
      if (!original) throw new Error('original_missing')
      return original
    })
    const replyId = await actor.mutation(api.messages.send, {
      authorId: owner,

      groupId,
      body: 'A quote reply',
      replyToMessageId: originalId,
    })
    const latest = await actor.query(api.messages.listPage, {
      groupId,
      userId: owner,
      paginationOpts: { cursor: null, numItems: 5 },
    })
    expect(latest.page.some((item) => item.message._id === originalId)).toBe(false)
    expect(latest.page.find((item) => item.message._id === replyId)?.replyTo).toMatchObject({
      messageId: originalId,
      body: 'History 0',
    })
    const focused = await actor.query(api.messages.listPage, {
      groupId,
      userId: owner,
      targetMessageId: originalId,
      paginationOpts: { cursor: null, numItems: 5 },
    })
    expect(focused.page.some((item) => item.message._id === originalId)).toBe(true)
    expect(focused.page.length).toBeLessThanOrEqual(5)
  })
  it('atomically links uploaded attachments and converges a send retry', async () => {
    const { groupId, owner, t } = await seedGroup()
    const actor = asUser(t, owner)
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(['atomic attachment'], { type: 'text/plain' })),
    )
    const uploadIntent = await actor.mutation(api.messages.generateUploadUrl, {
      contentType: 'text/plain',
      filename: 'atomic.txt',
      groupId,
      intentKey: 'atomic-send-attachment',
      size: 17,
      userId: owner,
    })
    await actor.mutation(api.messages.claimUploadIntent, {
      intentId: uploadIntent.intentId,
      storageId,
      userId: owner,
    })
    const sendArgs = {
      authorId: owner,
      attachments: [
        {
          contentType: 'text/plain',
          filename: 'atomic.txt',
          size: 17,
          uploadIntentId: uploadIntent.intentId,
        },
      ],
      body: 'Atomic send',
      groupId,
      idempotencyKey: 'atomic-send-retry',

    }
    const firstMessageId = await actor.mutation(api.messages.send, sendArgs)
    expect(await actor.mutation(api.messages.send, sendArgs)).toBe(firstMessageId)
    const message = await t.run(async (ctx) => await ctx.db.get(firstMessageId))
    expect(message?.attachmentIds).toHaveLength(1)
    const attachment = message?.attachmentIds[0]
      ? await t.run(async (ctx) => await ctx.db.get(message.attachmentIds[0]))
      : null
    expect(attachment).toMatchObject({
      contentType: 'text/plain',
      filename: 'atomic.txt',
      messageId: firstMessageId,
      storageId,
    })
  })
  it('enforces message deletion authority and writes a body-free audit', async () => {
    const { groupId, member, owner, t } = await seedGroup()
    const ownerActor = asUser(t, owner)
    const messageId = await ownerActor.mutation(api.messages.send, {
      authorId: owner,
      body: 'Delete this source.',
      groupId,
      idempotencyKey: 'deletable-message',

    })
    await expect(
      asUser(t, member).mutation(api.messages.remove, {
        actorId: member,
        messageId,
      }),
    ).rejects.toThrow('message_delete_forbidden')
    expect(await t.run(async (ctx) => await ctx.db.get(messageId))).not.toBeNull()
    await ownerActor.mutation(api.messages.remove, {
      actorId: owner,
      messageId,
    })
    expect(await t.run(async (ctx) => await ctx.db.get(messageId))).toBeNull()
    const deletionAudit = await t.run(
      async (ctx) =>
        await ctx.db
          .query('auditEvents')
          .withIndex('by_entity', (q) => q.eq('entityType', 'message').eq('entityId', messageId))
          .filter((q) => q.eq(q.field('action'), 'message.deleted'))
          .unique(),
    )
    expect(deletionAudit?.before).toMatchObject({ attachmentCount: 0 })
    expect(deletionAudit?.before).not.toHaveProperty('body')
  })
  it('keeps shared storage until its last attachment is deleted', async () => {
    const { groupId, owner, t } = await seedGroup()
    const actor = asUser(t, owner)
    const firstMessageId = await actor.mutation(api.messages.send, {
      authorId: owner,
      body: 'Original attachment',
      groupId,
      idempotencyKey: 'original-attachment',

    })
    const secondMessageId = await actor.mutation(api.messages.send, {
      authorId: owner,
      body: 'Copied attachment',
      groupId,
      idempotencyKey: 'copied-attachment',

    })
    const { firstAttachmentId, secondAttachmentId, storageId } = await t.run(async (ctx) => {
      const createdAt = Date.now()
      const sharedStorageId = await ctx.storage.store(new Blob(['shared attachment']))
      const attachment = {

        groupId,
        storageId: sharedStorageId,
        filename: 'shared.txt',
        contentType: 'text/plain',
        size: 17,
        kind: 'file' as const,
        uploadedBy: owner,
        createdAt,
      }
      const firstId = await ctx.db.insert('attachments', {
        ...attachment,
        messageId: firstMessageId,
      })
      const secondId = await ctx.db.insert('attachments', {
        ...attachment,
        messageId: secondMessageId,
      })
      await ctx.db.patch(firstMessageId, { attachmentIds: [firstId] })
      await ctx.db.patch(secondMessageId, { attachmentIds: [secondId] })
      return {
        firstAttachmentId: firstId,
        secondAttachmentId: secondId,
        storageId: sharedStorageId,
      }
    })
    await actor.mutation(api.messages.remove, { actorId: owner, messageId: firstMessageId })
    expect(
      await t.run(async (ctx) => ({
        firstAttachment: await ctx.db.get(firstAttachmentId),
        secondAttachment: await ctx.db.get(secondAttachmentId),
        storage: await ctx.db.system.get(storageId),
      })),
    ).toMatchObject({
      firstAttachment: null,
      secondAttachment: { _id: secondAttachmentId },
      storage: { _id: storageId },
    })
    await actor.mutation(api.messages.remove, { actorId: owner, messageId: secondMessageId })
    expect(await t.run(async (ctx) => await ctx.db.system.get(storageId))).toBeNull()
  })
})
async function seedGroup() {
 const t = convexTest(schema, modules)
 registerRateLimiter(t)
 const owner = await seedUser(t, 'chat-owner')
 const member = await seedUser(t, 'chat-member')
 const outsider = await seedUser(t, 'chat-outsider')
 const now = Date.now()
 const groupId = await t.run(async ctx => {
  const id = await ctx.db.insert('groups', { name: 'Chat', status: 'active', nextChannelSequence: 1, createdBy: owner, createdAt: now, updatedAt: now })
  for (const userId of [owner, member]) await ctx.db.insert('groupMembers', { groupId: id, userId, status: 'active', createdAt: now, updatedAt: now })
  return id
 })
 return { groupId, member, outsider, owner, t }
}
async function seedUser(t: TestBackend, subject: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      googleSubject: subject,
      email: `${subject}@example.test`,
      displayName: subject,
      twoFactorEnabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.patch(userId, { authUserId: String(userId) })
    return userId
  })
}
function asUser(t: TestBackend, userId: Id<'users'>) {
  return t.withIdentity({ subject: String(userId) })
}
