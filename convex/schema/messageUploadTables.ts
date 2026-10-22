import { defineTable } from 'convex/server';
import { v } from 'convex/values';
const uploadIntentStatus = v.union(v.literal('issued'), v.literal('uploaded'), v.literal('claimed'), v.literal('abandoned'));
const uploadIntentKind = v.union(v.literal('file'), v.literal('voice_note'));
export const messageUploadTables = {
    messageUploadIntents: defineTable({
        groupId: v.id('groups'),
        uploaderId: v.id('users'),
        intentKey: v.string(),
        storageId: v.optional(v.id('_storage')),
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        kind: v.optional(uploadIntentKind),
        durationMs: v.optional(v.number()),
        status: uploadIntentStatus,
        messageId: v.optional(v.id('messages')),
        createdAt: v.number(),
        updatedAt: v.number(),
        expiresAt: v.number(),
        claimedAt: v.optional(v.number()),
    })
        .index('by_uploader_intent_key', ['uploaderId', 'intentKey'])
        .index('by_storage', ['storageId'])
        .index('by_message', ['messageId'])
        .index('by_status_expires_at', ['status', 'expiresAt']),
};
