# Company, Project, and Channel identity marks

**Reviewed:** 1 October 2026  
**Scope:** Product design and technical approach for recognizable Company, Project, and Channel marks across Track mobile and web.  
**Status:** Shared identity tokens and fallback resolution are implemented. Project and Channel marks use allowlisted keys; Company admins can upload raster logos from Company settings.

## Recommendation

Build one shared **Entity Mark** system for the three Track scopes. Treat the mark as a compact, stable identity cue, not a mini-logo that animates on its own. Keep the mark next to the entity name, give each scope a recognizable default glyph and shape, and use a high-contrast background selected from a dedicated identity palette. Press feedback belongs to the surrounding Company switcher, Project row, or Channel row when that control has an action. Do not add a second nested button around the mark.

Use a hybrid identity model:

| Entity | Default | Customization | Why |
|---|---|---|---|
| Company | Show an uploaded company logo when present; otherwise use a deterministic identity pattern and color. | Company admins can upload or replace the Company logo. | Track already stores Company logos and has an admin-checked upload path. The fallback gives each Company a recognizable mark without requiring an upload. |
| Project | Use a deterministic identity pattern and color by default. | Project managers can choose from approved glyph and color tokens. | Project marks stay recognizable across mobile and web, while managers can choose a semantic glyph when they need one. |
| Channel | A Channel glyph on a stable background color. Use a lock glyph for a private Channel only when the access state is also named in text. | Use a small curated set of category glyphs/colors if Channel owners need customization; keep the default automatic. | A Channel is a conversation space inside a Project, so its mark should support scope recognition without suggesting a person or a separate Company. |

The system should always have a complete fallback. Render an uploaded Company logo first when one is present, then a configured glyph/color, then a deterministic identity pattern derived from the stable entity ID and scope type. Keep the adjacent Company, Project, or Channel name visible. Initials may supplement the fallback for names, but a single initial and a four-color palette are too collision-prone to be the whole identity system.

Do not use task status, priority, permission, or unread colors as entity-brand colors. The current mobile Company color helper selects among success, workflow, and accent semantic colors. Apple advises against using the same color to mean different things; an identity palette should be separate from task and access-state palettes.

## What “interactive” should mean

The mark should participate in the interaction that owns it, rather than responding to taps without a useful result:

- In the Company selector pill, tapping the control opens the Company switcher. The mark gives immediate scope recognition and gets the same short pressed feedback as the pill.
- In a Project row or Project selector, tapping the row/control opens or selects that Project. Do not make the mark a nested second action.
- In a Channel row or Channel header, tapping the row/control opens that Channel or its scoped details according to that control’s label. The mark stays decorative inside the parent action unless it has its own separately named purpose.
- In static attribution, task context, or read-only content, render a noninteractive mark and expose the entity name as adjacent text. Do not imply that a decorative logo is tappable.

Use a brief press-state change, such as a subtle surface response or 0.97–0.99 scale, only when it communicates that the parent control received the touch. Keep the mark itself still at rest. Do not use looping motion, parallax, glow, or a continuous pulse; those effects weaken recognition and add work to repeatedly scanned lists. Respect reduced-motion settings.

## Visual rules

1. Give each scope one consistent visual grammar across mobile and web: common sizing steps, optical alignment, image crop, background tokens, and fallback behavior.
2. Use a restrained set of carefully paired background and foreground colors. Calculate contrast for glyphs and initials, and test light, dark, and increased-contrast settings. WCAG 2.2 requires at least 3:1 contrast for meaningful non-text graphics and controls; normal text requires 4.5:1.
3. Do not use background color alone to distinguish scopes. Pair it with the right glyph/shape and the visible entity name. Never rely on color alone for private/public access or another important state.
4. Prefer simple glyphs or abstract marks at small sizes. Avoid detailed illustrations, random emoji, photographs as Project/Channel icons, or generated artwork that becomes illegible when reduced.
5. For uploaded Company logos, use a square crop preview and a rounded-square or circular mask in the interface. Keep a stable solid background behind transparent marks and provide a fallback for missing, invalid, or failed-to-load images.
6. Provide useful accessibility labels for an actionable control (for example, “Switch Company, Acme”). Hide a mark from the accessibility tree when the adjacent label already names the entity and the mark has no independent meaning.
7. Keep touch targets at least 44 pt on iOS and 48 dp on Android for the parent interactive control. A small logo can sit inside the larger target.

## Track codebase findings

- Company settings upload PNG, JPEG, or WebP files up to 5 MB through the admin-authorized upload and profile mutations. `companies.listMine` returns a shared logo URL for Company identity surfaces.
- Projects and Channels have optional `markIconKey` and `markColorKey` fields in `convex/schema.ts`. These fields accept only shared token lists, and missing keys resolve to stable defaults.
- Web Project and Channel edit dialogs let managers choose or reset marks. Mobile Project settings provides the same controls for Project managers.
- Mobile Project and Channel directories, Project settings, Company switchers, and web Project navigation render the shared marks. Web Channel navigation uses the shared resolver through its existing Channel avatar adapter.
- `apps/mobile/src/components/colored-avatar.tsx` supplies initials on four fixed colors and is widely used for people and several entity contexts. It should remain a person-avatar primitive rather than becoming the Company/Project/Channel identity API.
- `apps/mobile/src/lib/company-brand.ts` selects Company backgrounds from semantic success/workflow/accent colors. That helper is a useful local starting point for stable color assignment, but its current palette should not define entity identity because those colors already communicate task/workflow states.

Repository paths checked: `convex/schema.ts`, `convex/schema/companyCoreTables.ts`, `convex/companies.ts`, `convex/sharedProjects.ts`, `apps/mobile/src/components/colored-avatar.tsx`, `apps/mobile/src/lib/company-brand.ts`, and `apps/mobile/src/screens/conversations.tsx`.

## Implemented system and remaining validation

### Shared identity defaults

The mobile and web `EntityMark` components use `packages/shared/src/entity-identity.ts`, which has no UI dependencies. It selects a deterministic background from entity kind and stable ID and generates the same 5-by-5 identity pattern for automatic Company and Project marks. Channel and Board glyph fallbacks use their names. A saved Project or Channel glyph overrides the automatic Project mark. The palette is separate from task status and priority colors.

The marks appear in mobile Company switchers and Project/Channel directories, web Company and Project navigation, and Project settings. Existing web Channel wrappers use the shared resolver. A visual pass should still compare secondary legacy wrappers for size and alignment parity.

### Controlled customization

Project and Channel marks store allowlisted glyph and color keys. Records without keys keep the stable fallback. Company settings let administrators upload PNG, JPEG, or WebP logos up to 5 MB, preview the current logo, replace it, or return to the automatic mark.

Web Project and Channel edit dialogs and mobile Project settings save token choices to the entity. Company logo uploads use the Company admin check. Project and Channel updates use the existing Project manager policy, with authorization enforced in Convex.

### Validation still required

Automated checks cover stable fallback resolution, token validation, reset behavior, and manager authorization. Device and browser review across themes, larger text, image failure, and screen-reader navigation remains unverified. The parent control owns press feedback; the mark stays decorative.

## Storage and privacy boundary

Convex documents that a URL returned by `storage.getUrl()` is a bearer URL: anyone with it can fetch the file without another app-level authorization check. A membership-checked query controls who first receives the URL, but it cannot make an already-shared URL private. Therefore, only use direct Convex image URLs for assets intended to function as shared Company branding. Do not add user-uploaded Channel images or any image that could reveal sensitive Channel membership/context. If an image must remain permission-checked on every read, serve it through an authenticated HTTP action or another storage service with expiring URLs.

The current Company upload check trusts declared `contentType.startsWith('image/')` plus a size bound. Before broadening uploads to Projects or Channels, validate actual decoded file type, dimensions, and pixel count; re-encode accepted raster images; strip metadata; and prevent oversized/decompression-bomb images. Do not accept arbitrary SVG without a proven sanitizer. The simpler glyph/color customization avoids this expanded file risk.

## Evidence and limits

Platform standards support clear, consistent, high-contrast marks and restrained feedback; they do not prescribe that a Company, Project, or Channel needs an animated logo. Linear’s official Project docs show a close collaboration-product precedent for choosing a Project icon and color from presets. Slack’s official support docs explain the purpose of a workspace icon and show an upload/crop flow. The recommendation to reserve uploaded images for Company branding and use tokenized symbols for Projects and Channels is a Track product judgment based on its scope hierarchy, existing data, security boundary, and the cost of maintaining uploaded assets. It still needs validation with Track users.

## Sources

- [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color): use color deliberately, avoid assigning one color conflicting meanings, and test appearance and accessibility contexts.
- [Apple HIG: App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons): marks should express identity clearly and remain recognizable at small sizes; avoid unnecessary text and detail.
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): test contrast, larger text, and accessible descriptions.
- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion): use motion to explain feedback or state and respect motion preferences.
- [Android Developers: Accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility): label meaningful graphics, hide decorative graphics, use text and contrast cues, and keep touch targets at least 48 dp.
- [W3C WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html): color must not be the only visual means of conveying information or distinguishing items.
- [W3C WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html): meaningful UI components and graphics need sufficient contrast.
- [W3C WCAG 2.2: Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text requires 4.5:1 and large text requires 3:1.
- [Linear Docs: Projects](https://linear.app/docs/projects): recommends updating the Project icon for visibility and organization.
- [Linear Docs: Project overview](https://linear.app/docs/project-overview): supports choosing a Project icon and color from presets.
- [Linear Changelog: Team icons](https://linear.app/changelog/2022-01-20-linear-preview-new-sidebar-and-team-icons): describes colored team marks as a way to distinguish entities in navigation.
- [Slack Help: Upload a workspace icon](https://slack.com/help/articles/204379773-Upload-a-Slack-icon): first-party example of workspace image selection and crop.
- [Convex Docs: File Storage security](https://docs.convex.dev/file-storage/overview): explains bearer access for `storage.getUrl()` URLs and the limits of query-level authorization.
- [Convex Docs: Uploading files](https://docs.convex.dev/file-storage/upload-files): documents the upload URL, POST, and storage-ID persistence flow.
- [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/): documents cross-platform image loading, caching, crop, and accessibility-label support.
