# Web sidebar UI update

The web sidebar now uses one clean row shape. Icons sit in the same 28px box, labels get the space they need, and unread counts stay on the far right.

```text
sidebar row
├── 28px icon box
├── flexible label and helper text
└── optional trailing count
```

| Area | Result |
| --- | --- |
| Icon alignment | 100% of project and work rows use the same icon column |
| Long names | Labels keep a flexible column and truncate safely |
| Unread counts | Counts use a stable trailing column and hide in collapsed mode |
| Accessibility | Decorative icons are hidden from screen readers; named controls keep labels |
| Layout states | Expanded, collapsed, and mobile rules remain covered |

## Verification

Review captures belong outside the source tree. The sidebar review covered Company overview, Company settings, and the Projects directory. The recorded automated checks were web lint and TypeScript; this note does not establish the status of the current worktree.
