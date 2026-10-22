import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
const redactedKeys = new Set(['authorization', 'cookie', 'token', 'secret', 'apiKey']);
function redactValue(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(redactValue);
    if (!value || typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key,
        redactedKeys.has(key) ? '[redacted]' : redactValue(nested),
    ]));
}
export async function emitOperationalEvent(ctx: MutationCtx, input: {
    groupId?: Id<'groups'>;
    actorId?: Id<'users'>;
    name: string;
    fields?: Record<string, unknown>;
}) {
    await ctx.db.insert('auditEvents', {
        groupId: input.groupId,
        actorId: input.actorId,
        entityType: 'operationalEvent',
        entityId: input.name,
        action: `observability.${input.name}`,
        after: redactValue(input.fields ?? {}),
        createdAt: Date.now(),
    });
}
