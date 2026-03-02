## Why

When Claude Code finishes responding in a non-active workspace, the user has no visual signal that it needs attention. Users have to manually click through workspaces to check which ones are waiting for input. This creates friction and missed responses, especially when running multiple workspaces in parallel.

## What Changes

- Add per-workspace `hasUnread` state that tracks whether a workspace needs user attention
- Detect "waiting for user response" by listening for the **terminal bell character (`\x07`)** in the PTY data stream. Claude Code emits `\x07` when it finishes responding and is waiting for user input (via `preferredNotifChannel: terminal_bell`). When a bell is received on a non-active workspace, mark it as unread.
- Render a light blue circle indicator on unread workspace items in the sidebar (right-aligned dot)
- Dismiss the unread indicator when the user clicks on / switches to that workspace

## Capabilities

### New Capabilities
- `unread-indicator`: Per-workspace unread detection, state tracking, sidebar visual indicator, and dismissal on workspace focus

### Modified Capabilities

## Impact

- **Store**: `types.ts` — new `hasUnread` field on Workspace (or parallel map in AppState). New actions: `markWorkspaceUnread`, `clearWorkspaceUnread`
- **PTY data flow**: Renderer-side bell detection per workspace — scan each `pty:data` chunk for `\x07`. When bell is detected and workspace is not active, set `hasUnread = true`. Requires Claude Code's `preferredNotifChannel` set to `terminal_bell`.
- **Sidebar**: `Sidebar.tsx` + `Sidebar.module.css` — render blue dot indicator when `hasUnread` is true
- **Workspace switching**: `setActiveWorkspace` action clears `hasUnread` for the target workspace
- **Persistence**: `hasUnread` should NOT be persisted to disk (ephemeral, session-only state)
