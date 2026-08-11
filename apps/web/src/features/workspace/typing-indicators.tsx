import type { Doc } from '../../../../../convex/_generated/dataModel'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber } from '#/i18n'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { getAvatarTone, getInitials } from './identity'

const MAX_VISIBLE_NAMES = 2
const MAX_VISIBLE_AVATARS = 3
export const TYPING_INDICATOR_HEARTBEAT_MS = 2_000
export const TYPING_INDICATOR_VISIBLE_MS = 6_000
const TYPING_INDICATOR_EXIT_MS = 180

type TypingIndicatorItem = {
  indicator: Doc<'typingIndicators'>
  user: Doc<'users'> | null
}

export function filterActiveTypingIndicators(indicators: TypingIndicatorItem[], now: number) {
  const visibleSince = now - TYPING_INDICATOR_VISIBLE_MS
  return indicators
    .filter((item) => item.indicator.updatedAt >= visibleSince)
    .sort((a, b) => b.indicator.updatedAt - a.indicator.updatedAt)
}

function getIndicatorActivity(item: TypingIndicatorItem) {
  return item.indicator.activity ?? 'typing'
}

function normalizeActivity(activity: string | undefined) {
  if (activity === 'attaching') return 'attaching' as const
  if (activity === 'recording') return 'recording' as const
  return 'typing' as const
}

function getActivityCopy(
  activity: ReturnType<typeof getIndicatorActivity>,
  plural: boolean,
  labels?: { attaching: string; attachingPlural: string; recording: string; recordingPlural: string; typing: string; typingPlural: string },
) {
  if (activity === 'attaching') return plural ? labels?.attachingPlural ?? 'are adding attachments' : labels?.attaching ?? 'is adding an attachment'
  if (activity === 'recording') return plural ? labels?.recordingPlural ?? 'are recording voice notes' : labels?.recording ?? 'is recording a voice note'
  return plural ? labels?.typingPlural ?? 'are typing' : labels?.typing ?? 'is typing'
}

function formatNames(names: string[], labels?: { and: string; other: string; others: string; formatCount?: (count: number) => string }) {
  const visibleNames = names.map((name) => name.trim()).filter(Boolean)

  if (visibleNames.length === 0) return ''
  if (visibleNames.length === 1) return visibleNames[0]
  if (visibleNames.length === 2) return `${visibleNames[0]} ${labels?.and ?? 'and'} ${visibleNames[1]}`

  const namedPeople = visibleNames.slice(0, MAX_VISIBLE_NAMES).join(', ')
  const otherCount = visibleNames.length - MAX_VISIBLE_NAMES
  return `${namedPeople}, ${labels?.and ?? 'and'} ${labels?.formatCount?.(otherCount) ?? otherCount} ${otherCount === 1 ? labels?.other ?? 'other' : labels?.others ?? 'others'}`
}

export function formatTypingIndicatorText(
  items: Array<{ name: string; activity?: Doc<'typingIndicators'>['activity'] }>,
  labels?: {
    and: string
    other: string
    others: string
    attaching: string
    attachingPlural: string
    recording: string
    recordingPlural: string
    typing: string
    typingPlural: string
    composing: string
    composingPlural: string
    formatCount?: (count: number) => string
  },
) {
  const names = items.map((item) => item.name)
  const people = formatNames(names, labels)
  if (!people) return ''

  const activities = items.map((item) => normalizeActivity(item.activity))
  const firstActivity = activities[0] ?? 'typing'
  const hasMixedActivity = activities.some((activity) => activity !== firstActivity)
  if (hasMixedActivity) return `${people} ${items.length === 1 ? labels?.composing ?? 'is composing' : labels?.composingPlural ?? 'are composing'}`
  return `${people} ${getActivityCopy(firstActivity, items.length !== 1, labels)}`
}

export function TypingIndicatorLine({
  indicators,
}: {
  indicators: TypingIndicatorItem[]
}) {
  const { t } = useTranslation('workspace')
  const [displayedIndicators, setDisplayedIndicators] = useState(indicators)
  const [leaving, setLeaving] = useState(false)
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current)
      exitTimeoutRef.current = null
    }

    if (indicators.length > 0) {
      setDisplayedIndicators(indicators)
      setLeaving(false)
      return undefined
    }

    if (displayedIndicators.length === 0) return undefined

    setLeaving(true)
    exitTimeoutRef.current = setTimeout(() => {
      setDisplayedIndicators([])
      setLeaving(false)
      exitTimeoutRef.current = null
    }, TYPING_INDICATOR_EXIT_MS)

    return () => {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current)
        exitTimeoutRef.current = null
      }
    }
  }, [displayedIndicators.length, indicators])

  const text = formatTypingIndicatorText(
    displayedIndicators.map((item) => ({
      activity: getIndicatorActivity(item),
      name: item.user?.displayName ?? t('typing.someone'),
    })),
    {
      and: t('typing.and'),
      other: t('typing.other'),
      others: t('typing.others'),
      attaching: t('typing.attaching'),
      attachingPlural: t('typing.attachingPlural'),
      recording: t('typing.recording'),
      recordingPlural: t('typing.recordingPlural'),
      typing: t('typing.typing'),
      typingPlural: t('typing.typingPlural'),
      composing: t('typing.composing'),
      composingPlural: t('typing.composingPlural'),
      formatCount: formatNumber,
    },
  )
  const visibleIndicators = displayedIndicators.slice(0, MAX_VISIBLE_AVATARS)
  const hiddenCount = Math.max(0, displayedIndicators.length - MAX_VISIBLE_AVATARS)
  const className = [
    'track-typing-indicator',
    text ? 'active' : '',
    leaving ? 'leaving' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={className}
    >
      {text ? (
        <div className="track-typing-indicator-content">
          <span className="track-typing-avatar-stack" aria-hidden="true">
            {visibleIndicators.map((item) => {
              const name = item.user?.displayName ?? t('typing.someone')
              return (
                <Avatar
                  className={`track-avatar track-typing-avatar ${getAvatarTone(item.user?.email ?? name)}`}
                  key={item.indicator._id}
                >
                  <AvatarFallback>{getInitials(name)}</AvatarFallback>
                </Avatar>
              )
            })}
            {hiddenCount > 0 ? <span className="track-typing-avatar-more">+{formatNumber(hiddenCount)}</span> : null}
          </span>
          <span className="track-typing-text">{text}</span>
          <span className="track-typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      ) : null}
    </div>
  )
}
