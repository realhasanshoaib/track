export type ArchiveKind = 'channel' | 'company_exit' | 'project' | 'thread';

export type ArchiveDetails = {
  cutoffAt: number | null;
  kind: ArchiveKind;
  reason: string | null;
};

export type ArchivePresentation = {
  description: string;
  title: string;
};

function formatCutoff(cutoffAt: number | null) {
  if (cutoffAt === null || !Number.isFinite(cutoffAt)) return null;
  const date = new Date(cutoffAt);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
}

function readableReason(reason: string | null) {
  if (!reason) return null;
  if (reason === 'no_active_participants') return 'no active participants remain';
  return reason.replace(/[_-]+/g, ' ');
}

export function archivePresentation(details: ArchiveDetails | null | undefined): ArchivePresentation {
  const date = formatCutoff(details?.cutoffAt ?? null);
  const reason = readableReason(details?.reason ?? null);
  let title = 'Read-only archive';
  let summary = 'This conversation is read-only.';

  if (details?.kind === 'company_exit') {
    title = 'Company exit snapshot';
    summary = date
      ? `This snapshot includes messages through ${date}.`
      : 'This snapshot follows the recorded Company exit cutoff.';
  } else if (details?.kind === 'project') {
    title = 'Archived Project';
    summary = `This Project was archived${date ? ` on ${date}` : ''}${reason ? ` because ${reason}` : ''}.`;
  } else if (details?.kind === 'channel') {
    title = 'Archived Channel';
    summary = `This Channel was archived${date ? ` on ${date}` : ''}.`;
  } else if (details?.kind === 'thread') {
    title = 'Archived thread';
    summary = `This thread was archived${date ? ` on ${date}` : ''}.`;
  }

  return {
    title,
    description: `${summary} You can read, copy, or report messages. Replies, tasks, Track requests, edits, deletes, forwarding, and read-status updates are disabled.`,
  };
}
