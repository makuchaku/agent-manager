## 1. Data model & types

- [x] 1.1 Add `Automation` interface to `src/renderer/store/types.ts` (id, name, projectId, prompt, cronExpression, enabled, createdAt, lastRunAt, lastRunStatus)
- [x] 1.2 Add optional `automationId?: string` field to `Workspace` interface
- [x] 1.3 Add `automations: Automation[]` to `AppState` and `PersistedState`
- [x] 1.4 Add automation IPC channel constants to `src/shared/ipc-channels.ts` (AUTOMATION_CREATE, UPDATE, DELETE, LIST, RUN_NOW, STOP, RUN_STARTED)

## 2. Main process scheduler service

- [x] 2.1 Install `node-cron` dependency
- [x] 2.2 Create `src/main/automation-scheduler.ts` — AutomationScheduler class that manages cron jobs using node-cron, stores active jobs in a Map, exposes schedule/unschedule/runNow methods
- [x] 2.3 Implement run execution: spawn `claude -p "<prompt>" --no-input` via PtyManager in project repoPath, send `automation:run-started` event to renderer with ptyId and metadata
- [x] 2.4 Implement skip-if-running logic (track active run per automation, skip if previous still alive)
- [x] 2.5 Implement 10-minute run timeout (kill PTY on exceed)

## 3. IPC handlers & preload bridge

- [x] 3.1 Add automation IPC handlers in `src/main/ipc.ts` — create, update, delete, list, runNow, stop
- [x] 3.2 Wire handlers to AutomationScheduler (create → persist + schedule, delete → unschedule + remove, update → reschedule)
- [x] 3.3 Add `window.api.automations.*` methods to `src/preload/index.ts` (create, update, delete, list, runNow, stop, onRunStarted)
- [x] 3.4 On app startup, load persisted automations and schedule all enabled ones

## 4. Store actions

- [x] 4.1 Add automation CRUD actions to Zustand store (addAutomation, updateAutomation, removeAutomation)
- [x] 4.2 Add `onRunStarted` listener that creates workspace + terminal tab when main process fires a run (set automationId on workspace, name as `<automation> · <timestamp>`)
- [x] 4.3 Add run cleanup logic: before creating a new run workspace, count existing workspaces with same automationId, delete oldest if >= 5
- [x] 4.4 Include `automations` in debounced persistence save/restore

## 5. Sidebar UI — automations section

- [x] 5.1 Create `src/renderer/components/Sidebar/AutomationsSection.tsx` — collapsible section below projects, lists automations grouped by project
- [x] 5.2 Show automation name, human-readable schedule (cron-to-text), and status dot (green/red/gray based on lastRunStatus)
- [x] 5.3 Add hover actions per automation: Run now, Edit, Enable/Disable toggle, Delete (with confirm dialog)
- [x] 5.4 Show empty state ("No automations yet") with create button when no automations exist
- [x] 5.5 Visually distinguish automation run workspaces in sidebar (clock icon instead of branch icon, dimmed if disabled)

## 6. Create/edit automation dialog

- [x] 6.1 Create `src/renderer/components/Sidebar/AutomationDialog.tsx` — dialog with project dropdown, prompt textarea, schedule picker, name field
- [x] 6.2 Implement schedule presets: "Every hour", "Every 6 hours", "Daily at 9am", "Weekly on Monday", "Custom" (raw cron input)
- [x] 6.3 Auto-derive name from prompt (first 40 chars, editable)
- [x] 6.4 Wire dialog submit to `window.api.automations.create()` / `update()`
- [x] 6.5 Support edit mode: pre-fill dialog with existing automation values when editing

## 7. Integration & polish

- [x] 7.1 Wire AutomationsSection into Sidebar.tsx (render below project list, above bottom actions)
- [x] 7.2 Add CSS module styles for automations section (status dots, automation icon, disabled dimming)
- [x] 7.3 Handle automation deletion: confirm dialog, remove automation + all associated run workspaces
- [x] 7.4 Handle edge case: deleted project removes associated automations
