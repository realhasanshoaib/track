import { useEffect, useState } from 'react';

import { ActionButton } from '@/components/action-button';
import { OptionsSheet, SheetInput, SheetNote, SheetRow, SheetSection } from '@/components/options-sheet';

export const reportReasons = ['inaccurate', 'unsafe', 'spam', 'harassment', 'privacy', 'other'] as const;
export type ReportReason = (typeof reportReasons)[number];

const reportReasonLabels: Record<ReportReason, string> = {
  harassment: 'Harassment',
  inaccurate: 'Inaccurate',
  other: 'Something else',
  privacy: 'Privacy',
  spam: 'Spam',
  unsafe: 'Unsafe',
};

export function MessageReportSheet({
  busy,
  error,
  onClose,
  onSubmit,
  visible,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: ReportReason, note: string) => void;
  visible: boolean;
}) {
  const [reason, setReason] = useState<ReportReason>('inaccurate');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setReason('inaccurate');
    setNote('');
  }, [visible]);

  const needsNote = reason === 'other';
  const valid = !needsNote || Boolean(note.trim());

  return <OptionsSheet onClose={onClose} title="Report" visible={visible}>
    <SheetSection title="Reason">
      {reportReasons.map((item) => <SheetRow
        accessibilityRole="radio"
        icon="flag"
        key={item}
        label={reportReasonLabels[item]}
        onPress={() => setReason(item)}
        selected={reason === item}
      />)}
    </SheetSection>
    {needsNote ? <>
      <SheetInput
        label="What happened?"
        maxLength={1000}
        multiline
        onChangeText={setNote}
        placeholder="Add a short note"
        value={note}
      />
    </> : null}
    {error ? <SheetNote state="error">{error}</SheetNote> : null}
    <ActionButton disabled={busy || !valid} label="Submit report" loading={busy} onPress={() => onSubmit(reason, note.trim())} />
  </OptionsSheet>;
}
