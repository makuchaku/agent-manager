## Context

The app runs multiple workspaces side-by-side, each with terminal tabs running Claude Code. Only one workspace is visible at a time. When Claude Code finishes responding in a background workspace, the user has no way to know without manually clicking through each one.

Claude Code already emits the terminal bell character (`\x07`) when it finishes responding and is waiting for user input — this is a built-in feature via `preferredNotifChannel: terminal_bell`. PTY data flows: main process (node-pty `onData`) → IPC `pty:data:{ptyId}` → preload bridge → renderer `window.api.pty.onData(ptyId, cb)` → `term.write(data)` in TerminalPanel.

## Goals / Non-Goals

**Goals:**
- Show a visual indicator on sidebar workspace items when Claude Code is waiting for input in a non-active workspace
- Dismiss the indicator when the user switches to that workspace
- Zero false positives — only trigger on bell character, not heuristics

**Non-Goals:**
- Sound/audio notifications (handled by terminal bell natively)
- Detecting other types of "needs attention" beyond bell
- Persisting unread state across app restarts
- Configuring which workspaces track unread state

## Decisions

### 1. Detection method: scan PTY data for `\x07`

**Choice**: In the renderer, intercept PTY data before it reaches the terminal and check for the bell character (`\x07`).

**Why over idle timers**: Deterministic, no false positives. The bell character is specifically designed for this — Claude Code emits it when awaiting user input. No threshold tuning needed.

**Why over shell integration (OSC 133)**: OSC 133 requires shell profile setup and doesn't work for all shell types. The bell character works out of the box with a single Claude Code config setting.

**Where to intercept**: In `TerminalPanel.tsx` inside the existing `window.api.pty.onData(ptyId, cb)` callback (line 101). This is the single point where all PTY output flows through for each terminal. Check `data.includes('\x07')` before `term.write(data)`.

### 2. State: `Set<string>` in Zustand store, not on Workspace interface

**Choice**: Store unread workspace IDs as `unreadWorkspaceIds: Set<string>` in AppState, separate from the `Workspace` interface.

**Why**: `hasUnread` is ephemeral UI state that shouldn't be persisted. Putting it on the `Workspace` interface would require filtering it out of persistence and would change the `Workspace` type that other code depends on. A separate `Set<string>` is cleaner — it's trivially excluded from `getPersistedSlice()` and doesn't touch existing types.

**Alternative considered**: `Map<string, boolean>` on `Workspace` — rejected because it would require updating `PersistedState` to exclude it and modifying `hydrateState`.

### 3. State update flow

**Bell detected in non-active workspace** → call `markWorkspaceUnread(workspaceId)` → adds to `unreadWorkspaceIds` set.

**User switches to workspace** → `setActiveWorkspace` clears the workspace from `unreadWorkspaceIds` as a side-effect. No separate action needed.

### 4. Visual indicator: blue dot after workspace name

**Choice**: Small filled circle (CSS `::after` pseudo-element) on `.workspaceItem` when unread. Light blue (`--accent-blue`) to match the existing active state color palette. Positioned right-aligned within the workspace item row.

**Why `::after` over a React element**: Avoids adding DOM nodes and keeps the indicator purely presentational. Applied via a `.unread` CSS class toggled by the component.

**Why not badge count**: A simple dot is sufficient — the semantics are "needs attention", not "N unread messages". Matches conventions in Slack, Discord, VS Code sidebar.

### 5. TerminalPanel needs workspaceId

Currently `TerminalPanel` receives `ptyId` and `active` props. To call `markWorkspaceUnread(workspaceId)` on bell detection, it also needs to know which workspace it belongs to. Rather than prop-drilling, derive `workspaceId` from the tab that owns this PTY: look up `tabs.find(t => t.type === 'terminal' && t.ptyId === ptyId)?.workspaceId` inside the callback using `useAppStore.getState()`.

## Risks / Trade-offs

**Bell requires Claude Code config** → User must set `preferredNotifChannel: terminal_bell`. If not set, no bell emitted, no indicator shown. Mitigation: document the requirement; consider auto-configuring this when creating workspaces that run Claude Code.

**Bell from non-Claude programs** → Any program can emit `\x07` (e.g., tab completion in bash). This could cause false-positive unread indicators. Mitigation: acceptable — the indicator is lightweight and dismisses on click. False positives are low-cost.

**Multiple terminals per workspace** → A workspace can have multiple terminal tabs. Any of them emitting a bell should mark the workspace as unread. The current design handles this naturally since all terminals check against `activeWorkspaceId`.

## Open Questions

None — the design is straightforward and all decisions are resolved.
