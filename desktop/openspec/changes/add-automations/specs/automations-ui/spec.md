## ADDED Requirements

### Requirement: Automations sidebar section
The sidebar SHALL display an "Automations" section below the project list. The section SHALL be collapsible and show all automations grouped by project.

#### Scenario: Sidebar shows automations
- **WHEN** the user has created automations
- **THEN** the sidebar displays an "Automations" section with each automation listed
- **AND** each item shows the automation name, a human-readable schedule, and a status indicator

#### Scenario: Empty state
- **WHEN** no automations exist
- **THEN** the Automations section shows "No automations yet" with a create button

### Requirement: Automation status indicators
Each automation in the sidebar SHALL display a status indicator: green dot for last run succeeded, red dot for last run failed/timed out, gray dot for never run.

#### Scenario: Success indicator
- **WHEN** the last run's PTY exited with code 0
- **THEN** the automation shows a green status dot

#### Scenario: Failure indicator
- **WHEN** the last run's PTY exited with non-zero code or timed out
- **THEN** the automation shows a red status dot

#### Scenario: Never run indicator
- **WHEN** the automation has no run history
- **THEN** the automation shows a gray status dot

### Requirement: Create automation dialog
The system SHALL provide a multi-step dialog for creating automations with fields: project (dropdown), prompt (textarea), schedule (presets + custom cron), and name (auto-derived, editable).

#### Scenario: Open create dialog
- **WHEN** user clicks "+ New automation" in the sidebar
- **THEN** a dialog opens with project selector, prompt input, schedule picker, and name field

#### Scenario: Schedule presets
- **WHEN** user selects a schedule
- **THEN** the dialog offers presets: "Every hour", "Every 6 hours", "Daily at 9am", "Weekly on Monday", and a "Custom" option for raw cron expressions

#### Scenario: Name auto-derivation
- **WHEN** user enters a prompt
- **THEN** the name field auto-fills with a truncated version of the prompt (first 40 chars)
- **AND** the user can edit the name

#### Scenario: Submit create dialog
- **WHEN** user fills all fields and clicks "Create"
- **THEN** the automation is created, the dialog closes, and the automation appears in the sidebar

### Requirement: Automation context menu
Each automation in the sidebar SHALL have actions accessible via hover buttons or right-click: "Run now", "Edit", "Enable/Disable", and "Delete".

#### Scenario: Run now action
- **WHEN** user clicks "Run now" on an automation
- **THEN** the automation executes immediately and a new run workspace appears

#### Scenario: Enable/disable toggle
- **WHEN** user toggles an automation's enabled state
- **THEN** the automation's cron job is scheduled or unscheduled accordingly
- **AND** the sidebar item visually reflects the disabled state (dimmed)

#### Scenario: Delete with confirmation
- **WHEN** user clicks "Delete" on an automation
- **THEN** a confirmation dialog appears
- **AND** confirming deletes the automation and all its run workspaces

### Requirement: Automation run workspaces in sidebar
Automation run workspaces SHALL appear under their parent project in the sidebar, visually distinguished from manual workspaces (e.g., with a clock/automation icon instead of the branch icon).

#### Scenario: Run workspace appears
- **WHEN** an automation run completes creating a workspace
- **THEN** the workspace appears under the project with the automation icon and timestamp-based name

#### Scenario: Click run workspace
- **WHEN** user clicks an automation run workspace
- **THEN** the app switches to that workspace showing the terminal output from the Claude Code run

### Requirement: Edit automation dialog
The system SHALL allow editing an existing automation's name, prompt, schedule, and enabled state through a dialog pre-filled with current values.

#### Scenario: Open edit dialog
- **WHEN** user clicks "Edit" on an automation
- **THEN** a dialog opens pre-filled with the automation's current name, prompt, cron expression, and enabled state

#### Scenario: Save edits
- **WHEN** user modifies fields and clicks "Save"
- **THEN** the automation is updated and rescheduled if the cron expression changed
