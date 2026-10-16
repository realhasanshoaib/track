import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConversationComposer } from '#/features/workspace/components/ConversationComposer'

afterEach(cleanup)

describe('ConversationComposer keyboard behavior', () => {
  it('does not send while an IME candidate is composing', () => {
    const onSendMessage = vi.fn()
    render(
      <ConversationComposer
        ariaLabel="Message General"
        available
        busyAction={null}
        composer="draft"
        composerRef={createRef<HTMLTextAreaElement>()}
        emojiGroups={[]}
        emojiPickerOpen={false}
        filteredMentionOptions={[]}
        mentionIndex={0}
        mentionOptionRefs={{ current: [] }}
        mentionSections={[]}
        onAddAttachment={vi.fn()}
        onComposerBlur={vi.fn()}
        onComposerChange={vi.fn()}
        onComposerFocus={vi.fn()}
        onComposerKeyUp={vi.fn()}
        onComposerPaste={vi.fn()}
        onComposerSelect={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onInsertComposerText={vi.fn()}
        onMentionIndexChange={vi.fn()}
        onMentionSelect={vi.fn()}
        onRecordingChange={vi.fn()}
        onReplyChange={vi.fn()}
        onSendMessage={onSendMessage}
        onShowMentionMenuClose={vi.fn()}
        onVoiceNoteRecorded={vi.fn()}
        pendingAttachments={[]}
        placeholder="Message #General"
        removePendingAttachment={vi.fn()}
        replyTo={null}
        setComposerCursorFromRef={vi.fn()}
        showMentionMenu={false}
        voiceRecordingActive={false}
      />,
    )

    const textbox = screen.getByRole('textbox', { name: 'Message General' })
    fireEvent.compositionStart(textbox)
    fireEvent.keyDown(textbox, { key: 'Enter' })
    expect(onSendMessage).not.toHaveBeenCalled()
    fireEvent.compositionEnd(textbox)
    fireEvent.keyDown(textbox, { key: 'Enter' })
    expect(onSendMessage).toHaveBeenCalledTimes(1)
  })

  it('activates emoji options from the keyboard', () => {
    const onInsertComposerText = vi.fn()
    render(
      <ConversationComposer
        ariaLabel="Message General"
        available
        busyAction={null}
        composer="draft"
        composerRef={createRef<HTMLTextAreaElement>()}
        emojiGroups={[{ emojis: ['🙂'], label: 'Faces' }]}
        emojiPickerOpen
        filteredMentionOptions={[]}
        mentionIndex={0}
        mentionOptionRefs={{ current: [] }}
        mentionSections={[]}
        onAddAttachment={vi.fn()}
        onComposerBlur={vi.fn()}
        onComposerChange={vi.fn()}
        onComposerFocus={vi.fn()}
        onComposerKeyUp={vi.fn()}
        onComposerPaste={vi.fn()}
        onComposerSelect={vi.fn()}
        onEmojiPickerOpenChange={vi.fn()}
        onInsertComposerText={onInsertComposerText}
        onMentionIndexChange={vi.fn()}
        onMentionSelect={vi.fn()}
        onRecordingChange={vi.fn()}
        onReplyChange={vi.fn()}
        onSendMessage={vi.fn()}
        onShowMentionMenuClose={vi.fn()}
        onVoiceNoteRecorded={vi.fn()}
        pendingAttachments={[]}
        placeholder="Message #General"
        removePendingAttachment={vi.fn()}
        replyTo={null}
        setComposerCursorFromRef={vi.fn()}
        showMentionMenu={false}
        voiceRecordingActive={false}
      />,
    )

    const emoji = screen.getByRole('button', { name: 'Insert 🙂' })
    fireEvent.click(emoji, { detail: 0 })
    expect(onInsertComposerText).toHaveBeenCalledWith('🙂')
  })
})
