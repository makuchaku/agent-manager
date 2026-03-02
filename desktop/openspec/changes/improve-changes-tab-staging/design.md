## Context

The changes tab (`ChangedFiles.tsx`) currently shows a flat list of changed files with status badges. Clicking a file opens the diff viewer. There are no staging, unstaging, commit, or discard controls — all git write operations require the terminal.

The git service already parses `--porcelain=v1` and returns `FileStatus[]` with a `staged` boolean, but the current parser has a limitation: a file that's both staged and unstaged (e.g., `MM file.txt`) only gets one entry. The UI doesn't distinguish between staged and unstaged files visually.

## Goals / Non-Goals

**Goals:**
- VS Code-style staged/unstaged sections with `+`/`-` action buttons per file and per section header
- Fix `getStatus` to return separate entries when a file is both staged and unstaged
- Add git stage/unstage/discard/commit operations via IPC
- Commit message input + commit button in the changes panel

**Non-Goals:**
- Partial hunk staging (stage individual lines/hunks within a file)
- Merge conflict resolution UI
- Git push/pull/fetch
- Branch switching from the changes panel
- Amend commit

## Decisions

### 1. Dual-entry status parsing

**Decision**: Modify `getStatus` to emit two `FileStatus` entries when both `indexStatus` and `workStatus` are non-space/non-`?`. For example, `MM file.txt` → one entry with `staged: true` and one with `staged: false`.

**Rationale**: VS Code shows the same file in both sections when it has staged AND unstaged changes. This matches user expectations. Alternative was a `both` status, but that complicates UI logic.

### 2. UI layout: sections with inline actions

**Decision**: Split `ChangedFiles` into two collapsible sections:
- **Staged Changes** — section header with `−` (unstage all) button and file count
- **Changes** (unstaged) — section header with `+` (stage all) button and file count

Each file row gets a `+` (stage) or `−` (unstage) button on hover, plus a discard button (`↩`) for unstaged files. Clicking the file still opens the diff viewer.

**Rationale**: Matches VS Code UX exactly. Users already know this pattern.

### 3. Commit input placement

**Decision**: Place commit message `<textarea>` and "Commit" button above the staged section, inside the changes panel. Textarea auto-grows up to ~4 lines. Commit button is disabled when staged list is empty or message is blank.

**Rationale**: VS Code puts it at the top. Keeps the flow: type message → review staged → commit.

### 4. Action buttons appear on hover only

**Decision**: `+`/`-`/`↩` buttons render always but use `opacity: 0` until row hover (CSS only, no state). Section-level `+`/`-` buttons are always visible.

**Rationale**: Keeps the list clean. CSS-only avoids re-renders on hover.

### 5. Git operations — simple execFile calls

**Decision**: Add four methods to `GitService`:
- `stage(worktreePath, paths[])` → `git add -- <paths>`
- `unstage(worktreePath, paths[])` → `git reset HEAD -- <paths>`
- `discard(worktreePath, paths[])` → `git checkout -- <paths>` (tracked) / `git clean -f -- <paths>` (untracked)
- `commit(worktreePath, message)` → `git commit -m <message>`

Each gets a new IPC channel + preload method. After each mutating operation, the renderer calls `refresh()` to re-fetch status.

**Alternative considered**: Returning updated status from mutating operations. Rejected — simpler to just re-fetch, and the FS watcher already triggers refresh anyway.

### 6. Component state stays local

**Decision**: Selection state, commit message text, and section collapse state live in React component state, not Zustand. Only the file list data comes from IPC.

**Rationale**: This is transient UI state. No need to persist or share it. Keeps the store lean.

## Risks / Trade-offs

- **Race condition on rapid stage/unstage** → Mitigation: disable action buttons while an operation is in-flight (simple `loading` state flag)
- **Discard is destructive and irreversible** → Mitigation: no confirmation dialog for now (matches VS Code behavior), but could add one later
- **Large repos with many changed files** → Mitigation: virtualized list is a future concern; for now the list scrolls. Most real usage has <100 changed files
