import {
  Archive,
  BookOpen,
  Box,
  Braces,
  Database,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType2,
  FileVideo,
  Globe2,
  ImageIcon,
  KeyRound,
  Presentation,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

type AttachmentTone =
  | 'archive'
  | 'audio'
  | 'cad'
  | 'code'
  | 'data'
  | 'design'
  | 'doc'
  | 'ebook'
  | 'file'
  | 'font'
  | 'google'
  | 'html'
  | 'image'
  | 'markdown'
  | 'pdf'
  | 'secret'
  | 'sheet'
  | 'slides'
  | 'text'
  | 'video'

type AttachmentKind = {
  extensions?: string[]
  icon: LucideIcon
  label: string
  mimePrefixes?: string[]
  mimeSubstrings?: string[]
  tone: AttachmentTone
}

const attachmentKinds = [
  {
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'ico'],
    icon: FileImage,
    label: 'Image',
    mimePrefixes: ['image/'],
    tone: 'image',
  },
  {
    extensions: ['pdf'],
    icon: FileType2,
    label: 'PDF',
    mimeSubstrings: ['pdf'],
    tone: 'pdf',
  },
  {
    extensions: ['doc', 'docx', 'odt', 'pages', 'rtf'],
    icon: FileText,
    label: 'Doc',
    mimeSubstrings: ['msword', 'officedocument.wordprocessingml', 'opendocument.text', 'rtf'],
    tone: 'doc',
  },
  {
    extensions: ['txt', 'log'],
    icon: FileText,
    label: 'Text',
    mimePrefixes: ['text/plain'],
    tone: 'text',
  },
  {
    extensions: ['md', 'markdown', 'mdx'],
    icon: FileText,
    label: 'MD',
    mimeSubstrings: ['markdown'],
    tone: 'markdown',
  },
  {
    extensions: ['xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ods', 'numbers'],
    icon: FileSpreadsheet,
    label: 'Sheet',
    mimeSubstrings: ['csv', 'excel', 'officedocument.spreadsheetml', 'opendocument.spreadsheet'],
    tone: 'sheet',
  },
  {
    extensions: ['ppt', 'pptx', 'pptm', 'odp', 'key'],
    icon: Presentation,
    label: 'Slides',
    mimeSubstrings: ['powerpoint', 'presentation', 'officedocument.presentationml', 'opendocument.presentation'],
    tone: 'slides',
  },
  {
    extensions: ['gdoc', 'gdraw', 'gform', 'gsheet', 'gslides'],
    icon: Globe2,
    label: 'Google',
    mimeSubstrings: ['google-apps'],
    tone: 'google',
  },
  {
    extensions: ['htm', 'html'],
    icon: FileCode2,
    label: 'HTML',
    mimeSubstrings: ['html'],
    tone: 'html',
  },
  {
    extensions: ['json', 'jsonl'],
    icon: FileJson,
    label: 'JSON',
    mimeSubstrings: ['json'],
    tone: 'data',
  },
  {
    extensions: ['xml', 'yaml', 'yml', 'toml', 'ini', 'env'],
    icon: Braces,
    label: 'Data',
    mimeSubstrings: ['xml', 'yaml'],
    tone: 'data',
  },
  {
    extensions: [
      'c',
      'cc',
      'cpp',
      'cs',
      'css',
      'go',
      'java',
      'js',
      'jsx',
      'kt',
      'php',
      'py',
      'rb',
      'rs',
      'scss',
      'sh',
      'sql',
      'swift',
      'ts',
      'tsx',
      'vue',
    ],
    icon: FileTerminal,
    label: 'Code',
    mimeSubstrings: ['javascript', 'typescript', 'x-sh', 'x-sql'],
    tone: 'code',
  },
  {
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aiff', 'mid', 'midi', 'weba'],
    icon: FileAudio,
    label: 'Audio',
    mimePrefixes: ['audio/'],
    tone: 'audio',
  },
  {
    extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'ogv', 'wmv'],
    icon: FileVideo,
    label: 'Video',
    mimePrefixes: ['video/'],
    tone: 'video',
  },
  {
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'dmg', 'iso'],
    icon: FileArchive,
    label: 'Zip',
    mimeSubstrings: ['archive', 'compressed', 'gzip', 'tar', 'zip'],
    tone: 'archive',
  },
  {
    extensions: ['ai', 'fig', 'indd', 'psd', 'sketch', 'xd'],
    icon: ImageIcon,
    label: 'Design',
    mimeSubstrings: ['photoshop', 'illustrator'],
    tone: 'design',
  },
  {
    extensions: ['svg'],
    icon: FileCode2,
    label: 'SVG',
    mimeSubstrings: ['svg'],
    tone: 'design',
  },
  {
    extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
    icon: FileType2,
    label: 'Font',
    mimePrefixes: ['font/'],
    mimeSubstrings: ['font', 'woff'],
    tone: 'font',
  },
  {
    extensions: ['epub', 'mobi', 'azw', 'azw3'],
    icon: BookOpen,
    label: 'Book',
    mimeSubstrings: ['epub'],
    tone: 'ebook',
  },
  {
    extensions: ['db', 'sqlite', 'sqlite3', 'db3', 'mdb'],
    icon: Database,
    label: 'DB',
    tone: 'data',
  },
  {
    extensions: ['pem', 'key', 'cer', 'crt', 'p12', 'pfx'],
    icon: KeyRound,
    label: 'Key',
    tone: 'secret',
  },
  {
    extensions: ['apk', 'app', 'exe', 'msi', 'pkg'],
    icon: Box,
    label: 'App',
    tone: 'archive',
  },
] satisfies AttachmentKind[]

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function getAttachmentKind(input: { contentType?: string | null; filename: string }) {
  const contentType = input.contentType?.toLowerCase() ?? ''
  const extension = input.filename.split('.').pop()?.toLowerCase() ?? ''
  const matchedKind = attachmentKinds.find((kind) => matchesAttachmentKind(kind, contentType, extension))

  if (matchedKind) return matchedKind

  return {
    icon: Archive,
    label: extension ? extension.toUpperCase().slice(0, 5) : 'File',
    tone: 'file',
  } satisfies AttachmentKind
}

function matchesAttachmentKind(kind: AttachmentKind, contentType: string, extension: string) {
  return (
    includesValue(kind.extensions, extension) ||
    matchesAnyPrefix(kind.mimePrefixes, contentType) ||
    matchesAnySubstring(kind.mimeSubstrings, contentType)
  )
}

function includesValue(values: string[] | undefined, value: string) {
  return value.length > 0 && Boolean(values?.includes(value))
}

function matchesAnyPrefix(prefixes: string[] | undefined, value: string) {
  return value.length > 0 && Boolean(prefixes?.some((prefix) => value.startsWith(prefix)))
}

function matchesAnySubstring(substrings: string[] | undefined, value: string) {
  return value.length > 0 && Boolean(substrings?.some((substring) => value.includes(substring)))
}

type BrandMark = { className: string; glyph: ReactElement }

/**
 * Brand-colored file marks for the common types the design system calls out
 * (spreadsheet, PDF, Figma, Markdown/text). Brand hexes are the file-type logo
 * exception to the token-only rule. Everything else keeps the neutral tile.
 */
function getBrandMark(tone: AttachmentTone, extension: string): BrandMark | null {
  if (extension === 'fig') return { className: 'ft-fig', glyph: <FigmaMark /> }
  switch (tone) {
    case 'sheet':
      return { className: 'ft-xlsx', glyph: <SpreadsheetMark /> }
    case 'pdf':
      return { className: 'ft-pdf', glyph: <span className="track-ft-text">PDF</span> }
    case 'markdown':
      return { className: 'ft-md', glyph: <span className="track-ft-text">MD</span> }
    case 'text':
      return {
        className: 'ft-md',
        glyph: <span className="track-ft-text">{extension ? extension.toUpperCase().slice(0, 4) : 'TXT'}</span>,
      }
    default:
      return null
  }
}

function SpreadsheetMark() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="#fff" strokeLinecap="round" strokeWidth="2.4" viewBox="0 0 24 24" width="14">
      <path d="M6 5l12 14M18 5 6 19" />
    </svg>
  )
}

function FigmaMark() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 12 18" width="11">
      <path d="M6 0H3a3 3 0 0 0 0 6h3z" fill="#f24e1e" />
      <path d="M6 0h3a3 3 0 0 1 0 6H6z" fill="#ff7262" />
      <path d="M6 6H3a3 3 0 0 0 0 6h3z" fill="#a259ff" />
      <circle cx="9" cy="9" fill="#1abcfe" r="3" />
      <path d="M6 12H3a3 3 0 1 0 3 3z" fill="#0acf83" />
    </svg>
  )
}

export function AttachmentTypeIcon({
  contentType,
  filename,
  size = 15,
}: {
  contentType?: string | null
  filename: string
  size?: number
}) {
  const kind = getAttachmentKind({ contentType, filename })
  const { t } = useTranslation('workspace')
  const label = kind.tone === 'file' && !kind.extensions ? kind.label : t(`attachments.types.${kind.tone}`)
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  const brandMark = getBrandMark(kind.tone, extension)

  if (brandMark) {
    return (
      <span aria-label={label} className={`track-attachment-type-icon track-ft ${brandMark.className}`} role="img">
        {brandMark.glyph}
      </span>
    )
  }

  const Icon = kind.icon

  return (
    <span aria-label={label} className={`track-attachment-type-icon ${kind.tone}`} role="img">
      <Icon aria-hidden="true" size={size} />
      <small>{label}</small>
    </span>
  )
}
