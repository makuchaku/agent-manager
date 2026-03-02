## Why

The app currently only supports interactive, user-initiated terminal sessions. There's no way to schedule recurring Claude Code tasks — like nightly code reviews, periodic dependency checks, or scheduled refactors. An automations feature (similar to Codex's task runner) would let users define a prompt + cron schedule, and have the app automatically spin up a workspace with the results.

## What Changes

- New "Automations" section in the sidebar (below projects) for managing scheduled tasks
- Dialogue flow for creating automations: pick a project, write a prompt, set a cron schedule
- Cron scheduler in the main process that triggers automation runs on schedule
- Each automation run spawns Claude Code CLI (`claude -p "<prompt>"`) in the project directory and captures output
- Results appear as a new workspace in the sidebar under the associated project, with terminal output from the run
- Automation list shows last run status, next run time, and run history

## Capabilities

### New Capabilities
- `automations`: Data model, CRUD, cron scheduling, and execution of recurring Claude Code tasks. Covers the automation entity, scheduler lifecycle, CLI invocation, and result workspace creation.
- `automations-ui`: Sidebar section, create/edit dialogue, run history, and status indicators for automations.

### Modified Capabilities
_(none — no existing specs to modify)_

## Impact

- **Store**: New `automations` and `automationRuns` slices in Zustand store, plus persistence
- **Main process**: New `AutomationScheduler` service + IPC channels for automation CRUD and execution
- **Preload**: New `window.api.automations.*` bridge methods
- **IPC channels**: ~6 new channels (create, update, delete, list, run-now, stop)
- **Dependencies**: Add `node-cron` (or similar) for cron scheduling
- **Sidebar**: New collapsible "Automations" section with create button
- **New dialog component**: Multi-step automation creation flow
