## Context

The app manages git worktrees with integrated terminals. Users manually type commands into terminals. There's no way to run Claude Code on a schedule. The existing architecture has a clean separation: main process services (PtyManager, GitService, FileService) communicate with the renderer via IPC channels exposed through the preload bridge.

## Goals / Non-Goals

**Goals:**
- Users can create automations that run `claude -p "<prompt>"` in a project directory on a cron schedule
- Each run creates a workspace with a terminal showing the Claude Code output
- Automations are manageable from the sidebar (create, view, enable/disable, delete)
- Automations persist across app restarts and run while the app is open

**Non-Goals:**
- Running automations when the app is closed (no background daemon)
- Chaining automations or complex workflows
- Non-Claude-Code commands (shell scripts, arbitrary binaries)
- Notifications (push, system tray, etc.) — can add later
- Authentication or permissions model

## Decisions

### 1. Execution: `claude -p` via node-pty (not child_process.exec)

Run Claude Code through a PTY just like interactive terminals. This gives us streaming output in real-time and reuses the existing PtyManager infrastructure.

**Alternative**: `child_process.exec` with stdout capture. Rejected because it buffers output (no streaming), loses ANSI formatting, and would need a separate output viewer.

**Invocation**: `claude -p "<prompt>" --no-input` in the project's repoPath. The `--no-input` flag prevents Claude from prompting for user input since this is unattended.

### 2. Scheduler: node-cron in main process

Use `node-cron` to schedule jobs. Lightweight, no external dependencies (no Redis, no database), runs in-process.

**Alternative**: `setInterval` with manual cron parsing. Rejected — reinventing the wheel, cron expressions are a known standard.

**Alternative**: `node-schedule`. Either works, but `node-cron` is smaller and sufficient.

Scheduler lifecycle:
- On app startup: load automations from persisted state, schedule all enabled ones
- On create/update: reschedule the affected automation
- On delete/disable: unschedule
- On app quit: all jobs stop naturally (in-process)

### 3. Data model: Automations stored in Zustand + persisted state

Add `Automation` and `AutomationRun` types to the store. Persist automations (not runs — runs are ephemeral workspaces).

```
Automation {
  id, name, projectId, prompt, cronExpression, enabled, createdAt, lastRunAt?
}
```

Runs don't need a separate model — each run creates a standard Workspace + terminal Tab. Tag the workspace so the UI can distinguish automation-created workspaces.

**Decision**: Add an optional `automationId` field to the `Workspace` type. This links a workspace back to the automation that created it without a separate runs table.

### 4. Workspace creation per run

Each automation run creates a new workspace in the project. The workspace uses the project's repoPath directly (no worktree — automations run against the main repo, not a branch).

**Workspace naming**: `<automation-name> · <timestamp>` (e.g., "Code review · Feb 9 3:00 PM")

**Decision**: Set `worktreePath` to the project's `repoPath` and `branch` to empty string. This avoids creating git worktrees for automation runs (they're read-only observations, not branch work).

### 5. UI: Automations section in sidebar

Add a collapsible "Automations" section below the project list in the sidebar. Each automation shows:
- Name, project, schedule (human-readable)
- Enable/disable toggle
- Last run status indicator (green dot = success, red = failed, gray = never run)
- Click to expand → shows recent run workspaces

**Create dialog**: Multi-step dialog triggered by "+ New automation" button:
1. Select project (dropdown)
2. Enter prompt (textarea)
3. Set schedule (preset options + custom cron input)
4. Name (auto-derived from prompt, editable)

### 6. IPC: New `automation:*` channel group

```
AUTOMATION_LIST, AUTOMATION_CREATE, AUTOMATION_UPDATE, AUTOMATION_DELETE,
AUTOMATION_RUN_NOW, AUTOMATION_STOP
```

Main process owns the scheduler. Renderer sends CRUD commands; main process manages cron jobs and fires run events back.

**Run lifecycle IPC**: When a run starts, main process creates PTY and sends `automation:run-started` event to renderer with the ptyId. Renderer creates workspace + tab in store.

## Risks / Trade-offs

**[Stale workspaces accumulate]** → Auto-limit to last N runs per automation (default 5). Older run workspaces auto-deleted. Configurable.

**[Long-running Claude tasks]** → Set a timeout (default 10 min). Kill PTY if exceeded. Mark run as timed out.

**[App must be open]** → Acceptable for v1. Users who want always-on scheduling can leave the app running. Background daemon is a future enhancement.

**[Cron expression UX]** → Most users don't know cron syntax. Offer presets ("Every hour", "Daily at 9am", "Every Monday") with a "Custom" option for power users.

**[Concurrent runs of same automation]** → Skip if previous run still active. Log a warning.
