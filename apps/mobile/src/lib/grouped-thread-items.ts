type TimelineMessage = {
  message: { _id: string; createdAt: number };
  author: { _id: string } | null;
};

type TimelineAssistantStream = { _id: string; createdAt: number };

export type GroupedTimelineItem<Message, AssistantStream> =
  | { kind: 'message'; key: string; at: number; item: Message; isFirstInGroup: boolean }
  | { kind: 'assistant'; key: string; at: number; stream: AssistantStream; isFirstInGroup: boolean }
  | { kind: 'date-sep'; key: string; at: number; label: string };

type GroupThreadTimelineOptions<
  Message extends TimelineMessage,
  AssistantStream extends TimelineAssistantStream,
> = {
  assistantStreams?: readonly AssistantStream[];
  cardRowIds?: ReadonlySet<string>;
  deduplicateAssistantStreams?: boolean;
  messages?: readonly Message[];
  missingAuthorKey: string;
  pendingMessageIds?: ReadonlySet<string>;
  today?: Date;
};

const FIVE_MINUTES = 5 * 60 * 1000;

function dateSeparatorLabel(timestamp: number, today: Date): string {
  const date = new Date(timestamp);
  if (date.toDateString() === today.toDateString()) return 'Today';

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Builds the ordered, date-separated message list shared by Channels and threads. */
export function groupThreadTimeline<
  Message extends TimelineMessage,
  AssistantStream extends TimelineAssistantStream,
>({
  assistantStreams = [],
  cardRowIds = new Set(),
  deduplicateAssistantStreams = false,
  messages = [],
  missingAuthorKey,
  pendingMessageIds = new Set(),
  today = new Date(),
}: GroupThreadTimelineOptions<Message, AssistantStream>): GroupedTimelineItem<Message, AssistantStream>[] {
  const uniqueMessages = [...new Map(
    messages
      .filter((item) => !pendingMessageIds.has(item.message._id))
      .map((item) => [item.message._id, item] as const),
  ).values()];
  // Reverse a fresh copy to preserve the query's established display ordering.
  const messageItems = uniqueMessages.reverse().map((item) => ({
    kind: 'message' as const,
    key: item.message._id,
    at: item.message.createdAt,
    item,
    isFirstInGroup: true,
  }));
  const streams = deduplicateAssistantStreams
    ? [...new Map(assistantStreams.map((stream) => [stream._id, stream] as const)).values()]
    : assistantStreams;
  const assistantItems = streams.map((stream) => ({
    kind: 'assistant' as const,
    key: stream._id,
    at: stream.createdAt,
    stream,
    isFirstInGroup: true,
  }));
  const sortedItems = [...messageItems, ...assistantItems];
  // eslint-disable-next-line unicorn/no-array-sort -- sort a new array to preserve caller data.
  sortedItems.sort((left, right) => left.at - right.at);

  const result: GroupedTimelineItem<Message, AssistantStream>[] = [];
  let lastDate = '';
  let lastAuthor = '';
  let lastAt = 0;
  let interrupted = true;

  for (const item of sortedItems) {
    const date = new Date(item.at).toDateString();
    if (date !== lastDate) {
      result.push({ kind: 'date-sep', key: `sep-${item.at}`, at: item.at, label: dateSeparatorLabel(item.at, today) });
      lastDate = date;
      interrupted = true;
    }

    const author = item.kind === 'message'
      ? item.item.author?._id ?? missingAuthorKey
      : '__assistant__';
    const isFirstInGroup = interrupted || author !== lastAuthor || item.at - lastAt > FIVE_MINUTES;
    result.push({ ...item, isFirstInGroup });
    lastAuthor = author;
    lastAt = item.at;
    interrupted = cardRowIds.has(item.key);
  }

  return result;
}
