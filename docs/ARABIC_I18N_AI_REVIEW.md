# Arabic i18n AI review

## Result

The independent AI-only review passed for the bundled web and mobile catalogs.
No human language approval is required for this release.

The review used prompt revision `track-ar-review-v1` against integration commit
`7ea7ee84e1aa8ea646e5a5d66b5bc8e07f0b99b1` and the catalog fixes in its
working tree. The reviewed policy is Modern Standard Arabic, locale-derived
RTL, preserved product and technical names, and Latin digit glyphs through
`ar-u-nu-latn`.

## Reviewers

| Surface | Reviewer | Final result |
| --- | --- | --- |
| Web | Independent OpenAI Codex GPT-5 subagent | Pass |
| Expo mobile | Independent OpenAI Codex GPT-5 subagent | Pass |

The reviewers only inspected catalogs and call sites. They did not edit files
or rely on a human translator.

## Final catalog scope

| Surface | Namespaces | English keys | Arabic keys |
| --- | ---: | ---: | ---: |
| Web | 9 | 1,075 | 1,075 |
| Expo mobile | 3 | 531 | 531 |
| Total | 12 | 1,606 | 1,606 |

The final parity checks found no missing keys, extra keys, empty values, or
interpolation-variable mismatches. The reviewers also found no Arabic-Indic
digit glyphs in the catalogs.

## Review checklist

- Modern Standard Arabic meaning and tone
- Company, Project, Channel, thread, task, and evidence terminology
- Legal meaning, including billing and account-deletion language
- Interpolation variables and i18next plural categories
- Punctuation and count grammar
- `Track`, `@track`, `Google`, `Apple`, `General`, URLs, file tokens, and other
  proper or technical values
- Latin digit policy for counts, dates, durations, file sizes, and percentages
- Actual web and mobile call-site context

## Changes made from review findings

The web review corrected one legal-scope translation, deletion-dialog wording,
Company status and invitation terms, demo-account wording, task and workspace
phrasing, an untranslated report reason, and count labels that did not work
across Arabic number categories.

The mobile review corrected voice-duration semantics, delivery-intent wording,
evidence-grounded suggestion copy, represented-Company terminology, native
refresh wording, attachment message tense, percentage punctuation, and the
`General` Channel token. Manual one/other branches for task, comment, target,
delivery-intent, and Channel counts were replaced with Arabic-aware i18next
plural categories. Focused probes covered counts 0, 1, 2, 3, 11, 102, and a
decimal value.

## Final re-review

The web reviewer rechecked every reported key and returned pass with no
remaining exact-key defects. The mobile reviewer rechecked every reported key,
plural call site, and placeholder set, then returned pass after the final three
wording corrections. A final follow-up also reviewed the sign-in tagline found
during native smoke testing and returned pass after its MSA wording was aligned
with the English meaning.
