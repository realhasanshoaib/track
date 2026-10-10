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

import { resolveEntityMark, type EntityMarkIconKey } from '@track/shared'
import type { GroupReference } from './group-types'

type GroupAvatar = { Icon: LucideIcon; tone: string }

const icons: Record<EntityMarkIconKey, LucideIcon> = {
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
  milestone: Milestone,
  media: Images,
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

/** Shared scope identity resolution keeps names, colors, and glyphs stable on web and mobile. */
export function getGroupAvatar(group: GroupReference): GroupAvatar {
  const mark = resolveEntityMark({
    colorKey: group.markColorKey,
    iconKey: group.markIconKey,
    id: group._id,
    kind: 'channel',
    name: group.name,
  })
  return { Icon: icons[mark.iconKey], tone: mark.colorKey }
}
