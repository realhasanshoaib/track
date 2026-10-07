export type ConversationSearchFilter = 'all' | 'unread' | 'channels' | 'threads'

export function hasConversationMatches<TMessage extends { threadId?: unknown }>(
  results: { groups: readonly unknown[]; messages: readonly TMessage[]; threads: readonly unknown[] },
  filter: ConversationSearchFilter,
) {
  return (filter !== 'threads' && results.groups.length > 0)
    || (filter !== 'channels' && results.threads.length > 0)
    || results.messages.some((message) => filter === 'threads' ? Boolean(message.threadId) : filter === 'channels' ? !message.threadId : true)
}
