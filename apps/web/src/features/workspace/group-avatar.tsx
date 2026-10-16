import {
  BadgeDollarSign,
  Banknote,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Bug,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  Code2,
  Cpu,
  Database,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  Globe2,
  GraduationCap,
  Handshake,
  Headphones,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  Landmark,
  Layers3,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  PackageCheck,
  Palette,
  PenTool,
  PhoneCall,
  Rocket,
  Scale,
  SearchCheck,
  Server,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Target,
  TicketCheck,
  Truck,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { GroupReference } from './group-types'

type GroupAvatar = {
  Icon: LucideIcon
  tone: string
}

type GroupAvatarRule = GroupAvatar & {
  keywords: string[]
}

const groupAvatarRules: GroupAvatarRule[] = [
  {
    keywords: ['general', 'main', 'default', 'chat', 'all hands', 'common'],
    Icon: MessagesSquare,
    tone: 'sun',
  },
  { keywords: ['internal', 'private', 'team', 'staff', 'ops room'], Icon: UsersRound, tone: 'sky' },
  {
    keywords: ['commercial', 'sales', 'deal', 'revenue', 'pipeline'],
    Icon: BadgeDollarSign,
    tone: 'mint',
  },
  { keywords: ['customer', 'account', 'success'], Icon: Handshake, tone: 'rose' },
  { keywords: ['support', 'help', 'service', 'care'], Icon: Headphones, tone: 'indigo' },
  { keywords: ['engineering', 'dev', 'code', 'frontend', 'backend'], Icon: Code2, tone: 'slate' },
  { keywords: ['product', 'roadmap', 'feature', 'planning'], Icon: Layers3, tone: 'violet' },
  { keywords: ['design', 'creative', 'brand', 'ui', 'ux'], Icon: Palette, tone: 'pink' },
  { keywords: ['marketing', 'campaign', 'growth', 'ads'], Icon: Megaphone, tone: 'amber' },
  { keywords: ['finance', 'billing', 'invoice', 'payment'], Icon: WalletCards, tone: 'emerald' },
  { keywords: ['legal', 'contract', 'compliance', 'policy'], Icon: Scale, tone: 'stone' },
  { keywords: ['security', 'risk', 'privacy', 'access'], Icon: ShieldCheck, tone: 'blue' },
  { keywords: ['qa', 'quality', 'test', 'testing'], Icon: ClipboardCheck, tone: 'green' },
  { keywords: ['bug', 'issue', 'incident', 'hotfix'], Icon: Bug, tone: 'red' },
  { keywords: ['release', 'launch', 'deploy', 'shipping'], Icon: Rocket, tone: 'orange' },
  {
    keywords: ['data', 'analytics', 'reporting', 'metrics'],
    Icon: ChartNoAxesColumnIncreasing,
    tone: 'cyan',
  },
  { keywords: ['database', 'db', 'warehouse', 'storage'], Icon: Database, tone: 'teal' },
  { keywords: ['infra', 'platform', 'server', 'cloud'], Icon: Server, tone: 'zinc' },
  { keywords: ['ai', 'automation', 'agent', 'bot'], Icon: Bot, tone: 'purple' },
  { keywords: ['research', 'discovery', 'analysis', 'insights'], Icon: SearchCheck, tone: 'lime' },
  { keywords: ['docs', 'documentation', 'notes', 'knowledge'], Icon: BookOpen, tone: 'yellow' },
  {
    keywords: ['training', 'education', 'onboarding', 'learning'],
    Icon: GraduationCap,
    tone: 'cyan',
  },
  { keywords: ['mobile', 'ios', 'android', 'app'], Icon: MonitorSmartphone, tone: 'blue' },
  { keywords: ['web', 'website', 'landing', 'site'], Icon: Globe2, tone: 'sky' },
  { keywords: ['api', 'integration', 'sync', 'connector'], Icon: Cpu, tone: 'violet' },
  { keywords: ['meeting', 'standup', 'sync', 'weekly'], Icon: CalendarDays, tone: 'stone' },
  { keywords: ['action', 'todo', 'follow up'], Icon: TicketCheck, tone: 'green' },
  { keywords: ['procurement', 'supplier', 'purchase'], Icon: ShoppingCart, tone: 'amber' },
  { keywords: ['logistics', 'delivery', 'shipping', 'fleet'], Icon: Truck, tone: 'orange' },
  { keywords: ['hr', 'people', 'recruiting', 'hiring'], Icon: UserRoundCheck, tone: 'rose' },
  {
    keywords: ['executive', 'leadership', 'board', 'strategy'],
    Icon: BriefcaseBusiness,
    tone: 'slate',
  },
  { keywords: ['office', 'admin', 'facility'], Icon: Building2, tone: 'zinc' },
  { keywords: ['bank', 'treasury', 'capital', 'investor'], Icon: Landmark, tone: 'emerald' },
  { keywords: ['budget', 'cost', 'pricing', 'money'], Icon: Banknote, tone: 'mint' },
  { keywords: ['performance', 'speed', 'latency', 'optimization'], Icon: Gauge, tone: 'red' },
  { keywords: ['settings', 'config', 'setup', 'system'], Icon: Settings2, tone: 'stone' },
  { keywords: ['maintenance', 'repair', 'fix', 'cleanup'], Icon: Wrench, tone: 'amber' },
  { keywords: ['content', 'copy', 'writing', 'editorial'], Icon: PenTool, tone: 'pink' },
  { keywords: ['call', 'phone', 'voice', 'outbound'], Icon: PhoneCall, tone: 'green' },
  {
    keywords: ['partnership', 'partner', 'alliance', 'channel'],
    Icon: HeartHandshake,
    tone: 'rose',
  },
  { keywords: ['goal', 'okr', 'target', 'milestone'], Icon: Target, tone: 'red' },
  { keywords: ['experiment', 'lab', 'prototype', 'r&d'], Icon: FlaskConical, tone: 'purple' },
  { keywords: ['audit', 'approval', 'review', 'signoff'], Icon: FileCheck2, tone: 'blue' },
  { keywords: ['document', 'file', 'paperwork'], Icon: FileText, tone: 'yellow' },
  { keywords: ['package', 'inventory', 'fulfillment', 'stock'], Icon: PackageCheck, tone: 'lime' },
  { keywords: ['community', 'social', 'forum', 'members'], Icon: MessageCircle, tone: 'indigo' },
  { keywords: ['access', 'auth', 'login', 'permission'], Icon: KeyRound, tone: 'zinc' },
  { keywords: ['special', 'vip', 'priority', 'important'], Icon: Sparkles, tone: 'purple' },
  { keywords: ['question', 'faq', 'unknown', 'triage'], Icon: HelpCircle, tone: 'cyan' },
]

const fallbackAvatars: GroupAvatar[] = [
  { Icon: MessagesSquare, tone: 'sun' },
  { Icon: UsersRound, tone: 'sky' },
  { Icon: Handshake, tone: 'rose' },
  { Icon: Code2, tone: 'slate' },
  { Icon: Rocket, tone: 'orange' },
  { Icon: ShieldCheck, tone: 'blue' },
  { Icon: Palette, tone: 'pink' },
  { Icon: ChartNoAxesColumnIncreasing, tone: 'cyan' },
]

function stableIndex(value: string, modulo: number) {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % modulo
}

export function getGroupAvatar(group: GroupReference): GroupAvatar {
  const name = group.name.toLowerCase()
  const match = groupAvatarRules.find((rule) =>
    rule.keywords.some((keyword) => name.includes(keyword)),
  )
  if (match) return match

  if (group.kind === 'internal') return { Icon: UsersRound, tone: 'sky' }
  if (group.kind === 'commercials') return { Icon: BadgeDollarSign, tone: 'mint' }

  return fallbackAvatars[stableIndex(group.name, fallbackAvatars.length)] ?? fallbackAvatars[0]
}
