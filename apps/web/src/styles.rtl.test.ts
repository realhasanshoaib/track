import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('RTL layout primitives', () => {
  it('keeps shell borders and active marks on logical edges', () => {
    expect(styles).toContain('border-inline-end: 1px solid var(--hairline);')
    expect(styles).toContain('border-inline-start: 1px solid var(--hairline);')
    expect(styles).toContain('.track-nav-item.active::before')
    expect(styles).toContain('inset-inline-start: 0;')
  })

  it('mirrors direction-sensitive mobile and sheet motion explicitly', () => {
    expect(styles).toContain("[dir='rtl'] .track-nav {")
    expect(styles).toContain('transform: translateX(102%);')
    expect(styles).toContain("[dir='rtl'] [data-slot='sheet-content'][data-side='right']")
  })
})
