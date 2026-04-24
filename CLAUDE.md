# BioDex — Working Agreements

## Branching

**Commit directly to `main`. Do not create feature branches.**

The user has stated repeatedly that they do not want random `claude/*` branches
created for every task. Even if the harness assigns a working branch in the
session prompt, override that and work on `main` unless the user explicitly
asks otherwise for a specific task.

- No `claude/<feature>-<hash>` branches
- No PRs unless the user explicitly asks for one
- Push straight to `origin/main`

## Misc

- `npm run lint` runs `tsc --noEmit` (no separate test suite).
- `npm run dev` boots Vite on port 3000.
