import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation } from './_generated/server';
import { devAuthBypassUser } from './lib/devAuth';
function validNamespace(namespace: string) {
    if (!/^[a-z0-9-]{1,48}$/.test(namespace))
        throw new Error('e2e_fixture_namespace_invalid');
    return namespace;
}
function isLocalSiteUrl(value: string | undefined) {
    if (!value)
        return false;
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'));
    }
    catch {
        return false;
    }
}
function assertFixtureAccess(token: string) {
    if (process.env.TRACK_E2E_FIXTURE !== '1' ||
        !token ||
        token !== process.env.TRACK_E2E_FIXTURE_TOKEN ||
        !isLocalSiteUrl(process.env.SITE_URL)) {
        throw new Error('e2e_fixture_disabled');
    }
}
async function fixtureUser(ctx: MutationCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity ||
        identity.email?.trim().toLowerCase() !== devAuthBypassUser.email ||
        identity.subject !== devAuthBypassUser.googleSubject) {
        throw new Error('e2e_fixture_identity_required');
    }
    const existing = await ctx.db
        .query('users')
        .withIndex('by_google_subject', (query) => query.eq('googleSubject', devAuthBypassUser.googleSubject))
        .unique();
    const now = Date.now();
    if (existing) {
        await ctx.db.patch(existing._id, {
            // The first seed runs before Better Auth creates its local user, so use
            // the fixture identity as a bootstrap value only. Subsequent resets run
            // after browser sign-in and must preserve the real Better Auth subject.
            authUserId: existing.authUserId ?? identity.subject,
            normalizedEmail: devAuthBypassUser.email,
            email: devAuthBypassUser.email,
            displayName: devAuthBypassUser.displayName,
            profileDesignation: existing.profileDesignation ?? 'E2E fixture user',
            profileBannerStyle: existing.profileBannerStyle ?? 'silk',
            timezone: existing.timezone ?? 'UTC',
            profileCompletedAt: existing.profileCompletedAt ?? now,
            updatedAt: now,
        });
        return await ctx.db.get(existing._id);
    }
    const userId = await ctx.db.insert('users', {
        googleSubject: devAuthBypassUser.googleSubject,
        authUserId: identity.subject,
        normalizedEmail: devAuthBypassUser.email,
        email: devAuthBypassUser.email,
        displayName: devAuthBypassUser.displayName,
        profileDesignation: 'E2E fixture user',
        profileBannerStyle: 'silk',
        timezone: 'UTC',
        profileCompletedAt: now,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
    });
    return await ctx.db.get(userId);
}
async function clearFixture(ctx: MutationCtx, userId: Id<'users'>) {
 const groups = await ctx.db.query('groups').collect()
 for (const group of groups.filter(g => g.createdBy === userId)) {
  const attachments = await ctx.db.query('attachments').withIndex('by_group', q => q.eq('groupId', group._id)).collect()
  for (const a of attachments) {
   await ctx.storage.delete(a.storageId)
   if (a.previewStorageId) await ctx.storage.delete(a.previewStorageId)
  }
  for (const table of ['attachments', 'messages', 'groupMembers', 'groupReadStates', 'groupNotificationSettings', 'typingIndicators', 'invitations', 'auditEvents', 'contentReports', 'messageUploadIntents'] as const) {
   const rows = await ctx.db.query(table).filter(q => q.eq(q.field('groupId'), group._id)).collect()
   for (const row of rows) await ctx.db.delete(row._id)
  }
  await ctx.db.delete(group._id)
 }
}
async function seedFixture(ctx: MutationCtx, user: Doc<'users'>, namespace: string, historyMessageCount = 0) {
 const now = Date.now()
 for (const [name, email] of [['Amina Journey', 'amina'], ['Jon Journey', 'jon']]) {
  const normalizedEmail = email + '+' + namespace + '@example.test'
  const existing = await ctx.db.query('users').withIndex('by_normalized_email', q => q.eq('normalizedEmail', normalizedEmail)).unique()
  if (!existing) await ctx.db.insert('users', {
   googleSubject: 'fixture:' + normalizedEmail, authUserId: 'fixture:' + normalizedEmail,
   normalizedEmail, email: normalizedEmail, displayName: name ?? 'Journey person',
   twoFactorEnabled: false, createdAt: now, updatedAt: now,
  })
 }
 let primaryGroupId: Id<'groups'> | undefined
 for (const spec of [
  { name: 'E2E ' + namespace + ' Primary', status: 'active' as const, time: now, primary: true },
  { name: 'E2E ' + namespace + ' Secondary', status: 'active' as const, time: now - 1000, primary: false },
  { name: 'archived-review', status: 'archived' as const, time: now - 2000, primary: false },
 ]) {
  const count = spec.primary ? historyMessageCount + 2 : 1
  const groupId = await ctx.db.insert('groups', {
   name: spec.name, status: spec.status, nextChannelSequence: count + 1,
   createdBy: user._id, createdAt: spec.time - 500, updatedAt: spec.time,
  })
  await ctx.db.insert('groupMembers', { groupId, userId: user._id, status: 'active', createdAt: now, updatedAt: now })
  let oldest: Id<'messages'> | undefined
  if (spec.primary) {
   primaryGroupId = groupId
   for (let i = 1; i <= historyMessageCount; i += 1) {
    const id = await ctx.db.insert('messages', {
     groupId, authorId: user._id, body: 'E2E performance history message ' + i,
     channelSequence: i, mentions: [], attachmentIds: [], createdAt: now - 500 + i,
    })
    oldest ??= id
   }
   await ctx.db.insert('messages', {
    groupId, authorId: user._id, body: 'E2E source message: assign an owner before launch.',
    channelSequence: historyMessageCount + 1, mentions: [], attachmentIds: [], createdAt: now - 1,
   })
   await ctx.db.insert('messages', {
    groupId, authorId: user._id, body: 'Conversation evidence stays in the group.',
    replyToMessageId: oldest, channelSequence: historyMessageCount + 2, mentions: [], attachmentIds: [], createdAt: now,
   })
  } else {
   await ctx.db.insert('messages', {
    groupId, authorId: user._id,
    body: spec.status === 'archived' ? 'Archived evidence remains available for review.' : 'Secondary group history stays isolated.',
    channelSequence: 1, mentions: [], attachmentIds: [], createdAt: spec.time,
   })
  }
 }
 return { namespace, userId: user._id, primaryGroupId }
}
const fixtureArgs = {
    namespace: v.string(),
    token: fixtureTokenArgument,
};
export const seed = mutation({
    args: fixtureArgs,
    handler: async (ctx, args) => {
        assertFixtureAccess(args.token);
        const namespace = validNamespace(args.namespace);
        const user = await fixtureUser(ctx);
        if (!user)
            throw new Error('e2e_fixture_user_missing');
        await clearFixture(ctx, user._id);
        return await seedFixture(ctx, user, namespace);
    },
});
export const reset = mutation({
    args: fixtureArgs,
    handler: async (ctx, args) => {
        assertFixtureAccess(args.token);
        const namespace = validNamespace(args.namespace);
        const user = await fixtureUser(ctx);
        if (!user)
            throw new Error('e2e_fixture_user_missing');
        await clearFixture(ctx, user._id);
        return await seedFixture(ctx, user, namespace);
    },
});
export const performanceReset = mutation({
    args: fixtureArgs,
    handler: async (ctx, args) => {
        assertFixtureAccess(args.token);
        const namespace = validNamespace(args.namespace);
        const user = await fixtureUser(ctx);
        if (!user)
            throw new Error('e2e_fixture_user_missing');
        await clearFixture(ctx, user._id);
        return await seedFixture(ctx, user, namespace, 24);
    },
});
export const quoteReset = mutation({
    args: fixtureArgs,
    handler: async (ctx, args) => {
        assertFixtureAccess(args.token);
        const namespace = validNamespace(args.namespace);
        const user = await fixtureUser(ctx);
        if (!user)
            throw new Error('e2e_fixture_user_missing');
        await clearFixture(ctx, user._id);
        return await seedFixture(ctx, user, namespace, 150);
    },
});
