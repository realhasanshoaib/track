import { useEffect, useState } from 'react'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#/components/ui/tooltip'
import { getAvatarTone, getAvatarToneColor, getInitials } from './identity'
import { formatTime } from '#/i18n'
import {
  ProfileBannerBackground,
  type ProfileBannerStyle,
  normalizeProfileBannerStyle,
  usePrefersReducedMotion,
} from './profile-banners'

type ImagePalette = { primary: string; secondary: string } | null

const avatarPaletteCache = new Map<string, ImagePalette>()
const pendingAvatarPaletteLoads = new Map<string, Promise<ImagePalette>>()

type TeamMemberCardProps = {
  avatarUrl?: string | null
  bannerStyle?: string | null
  bio?: string | null
  detail?: string | null
  name: string
  toneSource?: string | null
  timezone?: string | null
}

type AvatarNameTooltipProps = TeamMemberCardProps & {
  align?: ComponentProps<typeof TooltipContent>['align']
  children: ReactNode
  side?: ComponentProps<typeof TooltipContent>['side']
}

export function TeamMemberCard({
  avatarUrl,
  bannerStyle,
  bio,
  detail,
  name,
  toneSource,
  timezone,
}: TeamMemberCardProps) {
  const localTime = timezone ? getLocalTimeLabel(timezone) : null
  const [imagePalette, setImagePalette] = useState<ImagePalette>(() =>
    avatarUrl ? avatarPaletteCache.get(avatarUrl) ?? null : null,
  )
  const avatarTone = getAvatarTone(toneSource ?? name)
  const fallbackPrimary = getAvatarToneColor(avatarTone)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!avatarUrl || typeof window === 'undefined') {
      setImagePalette(null)
      return
    }

    const cachedPalette = avatarPaletteCache.get(avatarUrl)
    if (avatarPaletteCache.has(avatarUrl)) {
      setImagePalette(cachedPalette ?? null)
      return
    }

    let cancelled = false
    void loadAvatarPalette(avatarUrl).then((palette) => {
      if (!cancelled) setImagePalette(palette)
    })
    return () => {
      cancelled = true
    }
  }, [avatarUrl])

  const cardStyle = {
    '--track-avatar-card-primary': imagePalette?.primary ?? fallbackPrimary,
    '--track-avatar-card-secondary': imagePalette?.secondary ?? fallbackPrimary,
  } as CSSProperties
  const selectedBannerStyle: ProfileBannerStyle = normalizeProfileBannerStyle(bannerStyle)

  return (
    <div className="track-avatar-card" style={cardStyle}>
      <div className="track-avatar-card-banner">
        <ProfileBannerBackground reducedMotion={reducedMotion} style={selectedBannerStyle} />
      </div>
      <div className="track-avatar-card-body">
        <Avatar className={`track-avatar-card-avatar ${avatarTone}`}>
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div className="track-avatar-card-copy">
          <strong>{name}</strong>
          {detail ? <small>{detail}</small> : null}
          {localTime ? <small>{localTime}</small> : null}
          {bio ? <p>{bio}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function AvatarNameTooltip({
  align = 'center',
  children,
  side = 'top',
  ...cardProps
}: AvatarNameTooltipProps) {
  return (
    <TooltipProvider closeDelay={250} delay={350}>
      <Tooltip>
        <TooltipTrigger
          closeOnClick={false}
          render={(props) => (
            <span
              {...props}
              className={['track-avatar-tooltip-trigger', props.className].filter(Boolean).join(' ')}
            >
              {children}
            </span>
          )}
        />
        <TooltipContent
          align={align}
          className="track-avatar-tooltip"
          side={side}
          sideOffset={8}
        >
          <TeamMemberCard {...cardProps} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function getImagePalette(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  const size = 24
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  try {
    context.drawImage(image, 0, 0, size, size)
    const pixels = context.getImageData(0, 0, size, size).data
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let index = 0; index < pixels.length; index += 16) {
      const alpha = pixels[index + 3] ?? 0
      if (alpha < 80) continue
      r += pixels[index] ?? 0
      g += pixels[index + 1] ?? 0
      b += pixels[index + 2] ?? 0
      count += 1
    }
    if (!count) return null
    const primary = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
    const secondary = `rgb(${Math.max(0, Math.round(r / count) - 32)}, ${Math.max(0, Math.round(g / count) - 32)}, ${Math.max(0, Math.round(b / count) - 32)})`
    return { primary, secondary }
  } catch {
    return null
  }
}

function loadAvatarPalette(avatarUrl: string) {
  const pendingLoad = pendingAvatarPaletteLoads.get(avatarUrl)
  if (pendingLoad) return pendingLoad

  const load = new Promise<ImagePalette>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const palette = getImagePalette(image)
      avatarPaletteCache.set(avatarUrl, palette)
      pendingAvatarPaletteLoads.delete(avatarUrl)
      resolve(palette)
    }
    image.onerror = () => {
      avatarPaletteCache.set(avatarUrl, null)
      pendingAvatarPaletteLoads.delete(avatarUrl)
      resolve(null)
    }
    image.src = avatarUrl
  })

  pendingAvatarPaletteLoads.set(avatarUrl, load)
  return load
}

function getLocalTimeLabel(timezone: string) {
  try {
    return formatTime(new Date(), {
      timeZone: timezone,
      timeZoneName: 'short',
    })
  } catch {
    return timezone
  }
}
