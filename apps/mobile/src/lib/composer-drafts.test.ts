import { afterEach, describe, expect, it } from 'vitest'
import {
  clearComposerDrafts,
  composerDraftKey,
  readComposerDraft,
  writeComposerDraft,
} from './composer-drafts'
afterEach(() => clearComposerDrafts())
describe('mobile composer draft scope', () => {
  it('preserves the Channel key', () => {
    expect(
      composerDraftKey({ actorId: 'user-a', projectId: 'project-a', groupId: 'group-a' }),
    ).toBe('user-a:legacy-membership:project-a:group-a:channel')
  })
  it('includes represented membership and Channel identity', () => {
    const scope = {
      actorId: 'user-a',
      projectMemberId: 'member-a',
      projectId: 'project-a',
      groupId: 'group-a',
    }
    expect(composerDraftKey(scope)).not.toBe(
      composerDraftKey({ ...scope, projectMemberId: 'member-b' }),
    )
  })
  it('does not expose one Channel draft in another Channel', () => {
    const scope = { actorId: 'user-a', projectId: 'project-a', groupId: 'group-a' }
    writeComposerDraft(scope, { composer: 'keep this', replyToMessageId: null })
    expect(readComposerDraft(scope)?.composer).toBe('keep this')
    expect(readComposerDraft({ ...scope, groupId: 'group-b' })).toBeNull()
  })
})
