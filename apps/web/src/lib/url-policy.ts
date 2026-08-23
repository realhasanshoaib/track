const whitespacePattern = /\s/
const dummyOrigin = 'https://track.local'

function includesControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && ((codePoint >= 0 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f))
  })
}

function hasUnsafeUrlCharacters(value: string) {
  if (includesControlCharacter(value) || whitespacePattern.test(value) || value.includes('\\')) {
    return true
  }

  try {
    const decoded = decodeURIComponent(value)
    return includesControlCharacter(decoded) || decoded.includes('\\')
  } catch {
    return true
  }
}

function parseLocalPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || hasUnsafeUrlCharacters(value)) {
    return null
  }

  try {
    const parsed = new URL(value, dummyOrigin)
    if (parsed.origin !== dummyOrigin || !parsed.pathname.startsWith('/')) return null
    return value
  } catch {
    return null
  }
}

function parseSameOriginRelativePath(value: string) {
  if (!value || value.startsWith('//') || hasUnsafeUrlCharacters(value)) return null

  try {
    const parsed = new URL(value, dummyOrigin)
    return parsed.origin === dummyOrigin ? value : null
  } catch {
    return null
  }
}

export function getSafeLocalReturnPath(value: string | null | undefined, fallback = '/workspace') {
  return (typeof value === 'string' ? parseLocalPath(value) : null) ?? parseLocalPath(fallback) ?? '/workspace'
}

export function getSafeMarkdownHref(value: string) {
  if (!value || hasUnsafeUrlCharacters(value)) return null

  const localPath = parseSameOriginRelativePath(value)
  if (localPath) return localPath

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname || parsed.origin === 'null') return null
    return value
  } catch {
    return null
  }
}
