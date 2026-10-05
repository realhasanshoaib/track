import { describe, expect, it } from 'vitest';

import { archivePresentation } from './archive-presentation';

describe('archivePresentation', () => {
  it('explains the Company exit cutoff and allowed safety actions', () => {
    const presentation = archivePresentation({ kind: 'company_exit', cutoffAt: Date.UTC(2026, 0, 10), reason: null });

    expect(presentation.title).toBe('Company exit snapshot');
    expect(presentation.description).toMatch(/messages through/);
    expect(presentation.description).toMatch(/report messages/);
    expect(presentation.description).toMatch(/read-status updates are disabled/);
  });

  it('turns the Project archive reason into user-facing copy', () => {
    const presentation = archivePresentation({ kind: 'project', cutoffAt: null, reason: 'no_active_participants' });

    expect(presentation.title).toBe('Archived Project');
    expect(presentation.description).toContain('because no active participants remain');
  });

  it('uses safe generic copy when the archive source is not known yet', () => {
    const presentation = archivePresentation(null);

    expect(presentation.title).toBe('Read-only archive');
    expect(presentation.description).toContain('This conversation is read-only.');
  });
});
