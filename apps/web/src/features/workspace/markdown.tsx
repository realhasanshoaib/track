import type { ReactNode } from 'react'

export function MarkdownText({
  className,
  highlightQuery,
  renderMention,
  text,
}: {
  className?: string
  highlightQuery?: string
  renderMention?: (handle: string, index: number) => ReactNode
  text: string
}) {
  const lines = text.split(/\r?\n/)
  const blocks: Array<{ kind: 'list'; items: string[] } | { kind: 'paragraph'; text: string }> = []
  let paragraph: string[] = []
  let listItems: string[] = []

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join('\n') })
      paragraph = []
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ kind: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of lines) {
    const listMatch = /^\s*[-*]\s+(.+)$/.exec(line)
    if (listMatch) {
      flushParagraph()
      listItems.push(listMatch[1])
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()

  return (
    <div className={className}>
      {blocks.map((block, blockIndex) =>
        block.kind === 'list' ? (
          <ul key={`list-${blockIndex}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>
                {renderMarkdownInline(item, renderMention, highlightQuery)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={`paragraph-${blockIndex}`}>
            {block.text.split('\n').map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderMarkdownInline(line, renderMention, highlightQuery)}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  )
}

function renderMarkdownInline(
  text: string,
  renderMention?: (handle: string, index: number) => ReactNode,
  highlightQuery?: string,
): ReactNode[] {
  const tokenPattern =
    /(\[[^\]]+\]\([^)]+\)|@[a-z0-9._-]+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/gi
  const parts = text.split(tokenPattern).filter(Boolean)

  return parts.map((part, index) => {

    if (/^@[a-z0-9._-]+$/i.test(part)) {
      if (renderMention) return renderMention(part.slice(1).toLowerCase(), index)

      return (
        <span
          className={'track-mention-inline'}
          key={`${part}-${index}`}
        >
          {part}
        </span>
      )
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (linkMatch) {
      return (
        <a href={linkMatch[2]} key={`${part}-${index}`} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      )
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${part}-${index}`}>
          {renderMarkdownInline(part.slice(2, -2), renderMention, highlightQuery)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={`${part}-${index}`}>
          {renderMarkdownInline(part.slice(1, -1), renderMention, highlightQuery)}
        </em>
      )
    }

    return <span key={`${part}-${index}`}>{highlightText(part, highlightQuery)}</span>
  })
}

function highlightText(text: string, query?: string) {
  const needle = query?.trim()
  if (!needle) return text

  const lowerText = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const nodes: ReactNode[] = []
  let cursor = 0
  let matchIndex = lowerText.indexOf(lowerNeedle)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex))
    }
    const end = matchIndex + needle.length
    nodes.push(
      <mark className="track-search-highlight" key={`${matchIndex}-${end}`}>
        {text.slice(matchIndex, end)}
      </mark>,
    )
    cursor = end
    matchIndex = lowerText.indexOf(lowerNeedle, cursor)
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes.length > 0 ? nodes : text
}
