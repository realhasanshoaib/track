export function channelSearchMessages<T extends { threadId?: unknown }>(messages: readonly T[]) {
  return messages.filter((message) => message.threadId == null);
}

export function hasChannelMessageMatches(messages: readonly { threadId?: unknown }[]) {
  return channelSearchMessages(messages).length > 0;
}
