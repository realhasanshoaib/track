import {
  Archive,
  BarChart3,
  Bookmark,
  BookOpen,
  Bug,
  Building2,
  CalendarDays,
  CalendarClock,
  Columns3,
  Code2,
  CircleHelp,
  Files,
  FolderKanban,
  Globe,
  Hash,
  Headphones,
  Image as ImageIcon,
  Images,
  Inbox,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Milestone,
  Plug,
  Rocket,
  Shield,
  Smartphone,
  Target,
  UsersRound,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { resolveEntityMark, type EntityMarkKind } from '@track/shared'

const icons: Record<ReturnType<typeof resolveEntityMark>['iconKey'], LucideIcon> = {
  archive: Archive,
  analytics: BarChart3,
  board: Columns3,
  bookmark: Bookmark,
  book: BookOpen,
  building: Building2,
  bug: Bug,
  calendar: CalendarDays,
  channel: Hash,
  checklist: ListChecks,
  code: Code2,
  conversation: MessageCircle,
  design: ImageIcon,
  files: Files,
  globe: Globe,
  idea: Lightbulb,
  inbox: Inbox,
  integration: Plug,
  launch: Rocket,
  media: Images,
  milestone: Milestone,
  mobile: Smartphone,
  people: UsersRound,
  project: FolderKanban,
  question: CircleHelp,
  shield: Shield,
  support: Headphones,
  target: Target,
  timeline: CalendarClock,
  video: Video,
}

type Props = {
  colorKey?: string | null
  iconKey?: string | null
  id: string
  imageUrl?: string | null
  kind: EntityMarkKind
  name: string
  size?: number
}

export function EntityMark({ colorKey, iconKey, id, imageUrl, kind, name, size = 32 }: Props) {
  const identity = resolveEntityMark({ colorKey, iconKey, id, kind, name })
  const [imageFailed, setImageFailed] = useState(false)
  const Icon = icons[identity.iconKey]
  const radius = kind === 'channel' ? '50%' : `${Math.round(size * 0.28)}px`
  return (
    <span
      aria-hidden="true"
      className={`track-entity-mark is-${kind}`}
      data-color={identity.colorKey}
      style={{
        backgroundColor: identity.palette.background,
        borderRadius: radius,
        color: identity.palette.foreground,
        height: size,
        width: size,
      }}
    >
      {kind === 'company' && imageUrl && !imageFailed
        ? <img alt="" height={Math.round(size * 0.72)} onError={() => setImageFailed(true)} src={imageUrl} width={Math.round(size * 0.72)} />
        : identity.pattern
          ? <span aria-hidden="true" style={{
              display: 'grid',
              gap: `${size * 0.035}px`,
              gridTemplateColumns: 'repeat(5, 1fr)',
              height: `${size * 0.62}px`,
              width: `${size * 0.62}px`,
            }}>
              {identity.pattern.map((filled, index) => <span key={index} style={{
                backgroundColor: filled ? identity.palette.foreground : 'transparent',
                borderRadius: `${Math.max(0.5, size * 0.02)}px`,
              }} />)}
            </span>
        : <Icon aria-hidden="true" size={Math.round(size * 0.48)} strokeWidth={2} />}
    </span>
  )
}
