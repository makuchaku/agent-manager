## Why

The changes tab currently only shows a flat list of changed files with status badges and diff viewing. There's no way to stage, unstage, or commit files — users must switch to a terminal for all git operations. Adding staging controls and file selection makes the changes tab actually useful for the commit workflow.

## What Changes

- Split changed files list into "Staged" and "Unstaged" sections based on git porcelain index vs worktree status
- Add checkboxes/selection UI to stage or unstage individual files
- Add "Stage All" / "Unstage All" bulk actions
- Add commit message input + commit button at the top of the changes panel
- Add discard changes action per-file (unstaged only)
- Wire up new git operations: `git add`, `git reset HEAD`, `git checkout --`, `git commit`
- New IPC channels + preload API methods for stage/unstage/commit/discard

## Capabilities

### New Capabilities
- `git-staging`: Stage, unstage, discard, and commit files through the changes tab UI

### Modified Capabilities

## Impact

- **Main process**: `git-service.ts` — add `stage()`, `unstage()`, `commit()`, `discard()` methods
- **IPC**: `ipc-channels.ts` — new channel constants; `ipc.ts` — new handlers
- **Preload**: `index.ts` — expose new `window.api.git.*` methods
- **Renderer**: `ChangedFiles.tsx` — split into staged/unstaged sections with selection UI; new commit input component
- **Store**: `app-store.ts` / `types.ts` — may need transient selection state (or keep local to component)
- **Tests**: New e2e tests for stage/unstage/commit/discard flows
