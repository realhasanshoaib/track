import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAllComposerDrafts,
  getComposerDraftKey,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftScope,
} from '#/features/workspace/chat/composer-drafts'
const baseScope: ComposerDraftScope = {
  actorId: 'user-a',
  projectId: 'project-a',
  groupId: 'group-a',
}
afterEach(() => {
  clearAllComposerDrafts()
})
describe('composer draft scope', () => {
  it('preserves the persisted Channel key', () => {
    expect(getComposerDraftKey(baseScope)).toBe(
      'user-a:legacy-membership:project-a:group-a:channel',
    )
  })
  it('separates actor, represented membership, project, and Channel', () => {
    const represented = {
      ...baseScope,
      projectMemberId: 'membership-a',
    }
    const otherActor = { ...represented, actorId: 'user-b' }
    const otherMembership = { ...represented, projectMemberId: 'membership-b' }
    expect(
      new Set([
        getComposerDraftKey(represented),
        getComposerDraftKey(otherActor),
        getComposerDraftKey(otherMembership),
        getComposerDraftKey({ ...represented, groupId: 'other-group' }),
      ]).size,
    ).toBe(4)
  })
  it('retains text within a session without sharing it across scopes', () => {
    writeComposerDraft(baseScope, { composer: 'unsent note', replyToMessageId: null })
    expect(readComposerDraft(baseScope)).toEqual({
      composer: 'unsent note',
      replyToMessageId: null,
    })
    expect(readComposerDraft({ ...baseScope, groupId: 'group-b' })).toBeNull()
  })
})
