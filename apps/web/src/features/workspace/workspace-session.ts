import type { Id } from '../../../../../convex/_generated/dataModel'

const resolvedTrackUserIds = new Map<string, Id<'users'>>()

export function clearResolvedTrackUserIds() {
  resolvedTrackUserIds.clear()
}

export function getResolvedTrackUserId(sessionUserId: string) {
  return resolvedTrackUserIds.get(sessionUserId) ?? null
}

export function setResolvedTrackUserId(sessionUserId: string, trackUserId: Id<'users'>) {
  resolvedTrackUserIds.set(sessionUserId, trackUserId)
}

export function getSessionUser(sessionData: unknown, fallbackName = 'Track User') {
  if (!sessionData || typeof sessionData !== 'object') return null

  const data = sessionData as {
    user?: {
      id?: string | null
      email?: string | null
      name?: string | null
    } | null
    session?: {
      userId?: string | null
    } | null
    id?: string | null
    email?: string | null
    name?: string | null
  }
  const user = data.user ?? data
  const id = user.id ?? data.session?.userId

  if (!id) return null

  return {
    id,
    email: user.email ?? '',
    name: user.name ?? user.email?.split('@')[0] ?? fallbackName,
  }
}
