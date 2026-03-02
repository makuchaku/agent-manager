## 1. Backend — Git service & IPC

- [x] 1.1 Add `stage(worktreePath, paths[])`, `unstage(worktreePath, paths[])`, `discard(worktreePath, paths[])`, and `commit(worktreePath, message)` methods to `GitService` in `src/main/git-service.ts`. Discard uses `git checkout --` for tracked files and `git clean -f --` for untracked.
- [x] 1.2 Fix `getStatus` to emit two `FileStatus` entries when a file has both index and worktree changes (e.g. `MM` → one staged + one unstaged entry). Currently only one entry is returned.
- [x] 1.3 Add IPC channel constants `GIT_STAGE`, `GIT_UNSTAGE`, `GIT_DISCARD`, `GIT_COMMIT` to `src/shared/ipc-channels.ts`
- [x] 1.4 Register `ipcMain.handle` for the four new channels in `src/main/ipc.ts`, delegating to `GitService`
- [x] 1.5 Expose `stage`, `unstage`, `discard`, `commit` methods on `window.api.git` in `src/preload/index.ts`

## 2. UI — ChangedFiles component rewrite

- [x] 2.1 Rewrite `ChangedFiles.tsx` to split files into staged/unstaged arrays and render two sections: "Staged Changes (N)" with `−` unstage-all button in header, and "Changes (N)" with `+` stage-all button in header. Only render a section when it has files.
- [x] 2.2 Add per-file action buttons: `+` (stage) on unstaged rows, `−` (unstage) on staged rows, `↩` (discard) on unstaged tracked rows. Buttons visible on hover only (CSS `opacity`).
- [x] 2.3 Add commit message `<textarea>` and "Commit" button above the staged section. Disable commit button when message is empty or no staged files. Clear message on successful commit.
- [x] 2.4 Add loading guard: disable all action buttons while a git operation is in-flight to prevent race conditions.
- [x] 2.5 Ensure clicking file name still opens diff tab (existing behavior preserved alongside new action buttons).

## 3. Styles

- [x] 3.1 Add CSS for section headers (label + count + action button), file-row hover action buttons (`opacity: 0` → `1` on hover), commit input area, and disabled button states in `RightPanel.module.css`.

## 4. Tests

- [x] 4.1 Add e2e tests covering: stage file via `+` button, unstage file via `−` button, stage-all / unstage-all via section header buttons, commit with message, discard unstaged change, and verifying staged/unstaged section separation.
