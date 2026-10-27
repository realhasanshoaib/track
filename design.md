---
name: Track
colors:
  surface: '#faf9f7'
  surface-container: '#f3f1ed'
  surface-container-high: '#ebe8e2'
  on-surface: '#1b1917'
  on-surface-variant: '#6b655c'
  primary: '#1b1917'
  on-primary: '#faf9f7'
  secondary: '#f0b100'
  on-secondary: '#1b1917'
  outline: '#d6d1c6'
  outline-variant: '#e3dfd7'
  error: '#b91c1c'
---
# Design System: Track

Source-derived using [Google Stitch's DESIGN.md guidance](https://github.com/google-labs-code/stitch-skills/blob/main/plugins/stitch-design/skills/extract-design-md/SKILL.md).
The frontmatter maps Track's light palette to Stitch roles; `secondary` represents
Track's yellow accent, not its CSS `--secondary` alias. Implementation values
remain in [web styles](apps/web/src/styles.css) and the
[shared theme](packages/shared/src/theme.ts). Update this file when the design
system changes, not for each component edit. This is not a visual QA signoff.

## 1. Visual Theme & Atmosphere

Track is a warm, quiet workroom: paper-colored surfaces, dark stone typography,
fine dividing lines, and small yellow signals. The main workspace is compact
enough for active conversation and task work, without making every row a
competing card. Hierarchy comes from typography, alignment, and surface tone
before decoration.

Conversation leads. Company, Project, and Channel context stays recognizable
while people move between messages, tasks, and threads. Assistant answers are
visibly distinct but do not dominate the human conversation. Dark mode keeps
the same warm character rather than switching to a blue-black technology theme.

## 2. Color Palette & Roles

### Primary Foundation

Warm Paper `#faf9f7` is the light canvas. Layered Paper `#f3f1ed` separates
navigation and secondary regions; deeper Paper `#ebe8e2` supports subdued
controls and surfaces. Hairlines `#e3dfd7` and `#d6d1c6` define edges quietly.
Dark mode uses `#151412`, `#1e1c19`, and `#292620` for the corresponding layers,
with warm borders `#373229` and `#4a4336`.

### Accent & Interactive

Stone Ink `#1b1917` on light surfaces is also the primary button fill, paired
with paper text. Signal Yellow `#f0b100` supplies selection, focus, and attention;
it is not the default fill for every primary action. Pale yellow `#fdf8e8`
marks gentle selection regions. Use text-safe Amber `#8a6400` when the accent
must carry small text on light paper. Dark mode uses yellow `#f3b70b` and
bright amber `#f5c53d` against warm charcoal.

### Typography & Text Hierarchy

Use Stone Ink for primary content, `#3a3631` for secondary emphasis, and
`#6b655c` for metadata. Dark-mode text steps from `#eee9dd` to `#d8d0c2` and
`#a89f90`. Muted text remains readable; low-contrast decoration must not become
the only way to find an action or understand permission.

### Functional States

Success Green `#15803d`, Danger Red `#b91c1c`, and Information Blue `#1d4ed8`
carry functional meaning. Their dark-mode counterparts are `#5bbf74`,
`#f87171`, and `#7ea7ff`. Pair status colors with words or icons. Company
identity, unread state, conflict, and destructive intent never rely on color alone.

## 3. Typography Rules

### Hierarchy & Weights

Inter is the interface and conversation family. SF Pro Rounded, with
`ui-rounded` and Inter fallbacks, supplies restrained display headings; do not
bundle the Apple font. Geist supports metadata. Geist Mono identifies task
keys, keycaps, and file extensions rather than ordinary prose.

Use medium or semibold weight to establish headings and actions; keep message
text comfortable for sustained reading. Metadata stays subordinate but legible.
Long task titles and mixed left-to-right/right-to-left content must survive
without hiding the words that distinguish one task from another.

### Spacing Principles

Conversation needs breathing room between authors and message groups, not
large marketing headings. Keep related label/value pairs close and separate
unrelated actions. Avoid forcing every surface into a single font size or
inventing a new type scale from this document; use the maintained primitives.

## 4. Component Stylings

### Buttons

Primary actions use the solid ink/paper treatment. Secondary and navigation
controls use paper surfaces, fine borders, and restrained hover changes.
Disabled controls become quieter without looking like an active primary action.
Keep keyboard focus visible and name icon-only controls.

### Cards & Conversation Surfaces

Task cards and supporting panels use light borders and modest rounding;
messages should read as a continuous conversation rather than a stack of
oversized floating cards. Shared radii are 6, 8, and 12 pixels. Reserve full
rounding for avatars, pills, and circles. Use shadows for overlays and sheets,
not to elevate every ordinary row.

### Navigation

Group Projects under their Company and keep the current Project and Channel
visible across conversation, task, and thread views. Collapsed navigation keeps
identity, accessible names, and actions. Company badges explain representation
without outranking the person's name. Do not reveal restricted Channel details
in counts, snippets, or administrative explanations.

### Inputs & Forms

Forms use paper surfaces and explicit labels. The composer is anchored to its
conversation and keeps text on failure. Task forms show conflicts without
silently discarding edits. Loading, empty, offline, denied, error, and read-only
states require distinct, understandable treatment and an appropriate recovery path.

### Tasks, Evidence & Archives

Keep references close to the task or answer they support. Workflow groups should
combine equivalent states without disguising different workflows as the same
status. Archived conversations have no writable controls. Distinguish a temporary
Project capture pause from a Company's permanently frozen exit archive; explain
the cutoff and show capture-management controls only to authorized administrators.

## 5. Layout Principles

### Grid & Structure

Use a stable navigation region and a flexible work surface. Task views inherit
that shell instead of becoming a separate product. Dense member/settings lists
are appropriate; the conversation area prioritizes reading and composing.

### Whitespace Strategy

Use compact, consistent gaps within controls and larger separation between
functional regions. Let content determine height. Avoid decorative empty space
that pushes source context or primary actions out of view.

### Alignment & Visual Balance

Align titles, metadata, and actions along readable edges. Keep author identity,
represented Company, task status, and evidence legible before ornamental details.
Do not use company color or icon position as the only explanation of authority.

### Responsive Behavior & Touch

Mobile adapts the hierarchy with full-screen destinations and native actions
rather than shrinking the desktop. Primary touch targets are at least 44px.
Respect safe areas, the keyboard, and reduced-motion preferences. Preserve
semantic controls, visible focus, WCAG AA contrast, and announcements for
significant async changes. Permission explanations must work without hover.

## 6. Design System Notes for Stitch Generation

### Language to Use

Use “warm paper workspace,” “stone typography,” “compact conversation-first
layout,” “fine warm borders,” and “restrained yellow attention.” Avoid glossy
gradients, glass panels, oversized pills, and a generic blue SaaS palette.

### Color References

Ask for Warm Paper `#faf9f7`, Stone Ink `#1b1917`, and Signal Yellow `#f0b100`.
Primary buttons are ink, not yellow. For dark screens, specify warm charcoal
`#151412` and parchment text `#eee9dd` rather than simply asking to invert colors.

### Component Prompts

- Design a Track Project conversation with a Company/Project sidebar, a clear
  Channel header, readable human messages, inline evidence, and a grounded composer.
- Design a task detail surface in the same shell, keeping its conversation
  reference, workflow state, and unsaved-edit conflict visible without visual noise.

### Incremental Iteration

Refine one flow in the established shell before extending it. Check its dark,
mobile, empty, denied, error, and read-only states. Preserve the product model
in [theory.md](theory.md); generated concepts do not authorize new product scope.
