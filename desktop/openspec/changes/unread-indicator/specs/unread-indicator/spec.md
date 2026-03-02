## ADDED Requirements

### Requirement: Bell detection marks workspace as unread
The system SHALL monitor all PTY data streams for the terminal bell character (`\x07`). When a bell character is detected in a workspace that is NOT currently active, the system SHALL mark that workspace as unread.

#### Scenario: Bell received in background workspace
- **WHEN** a terminal in a non-active workspace emits data containing `\x07`
- **THEN** that workspace SHALL be marked as unread

#### Scenario: Bell received in active workspace
- **WHEN** a terminal in the currently active workspace emits data containing `\x07`
- **THEN** the workspace SHALL NOT be marked as unread (user is already looking at it)

#### Scenario: Multiple bells in same workspace
- **WHEN** multiple bell characters are received in a non-active workspace before the user switches to it
- **THEN** the workspace SHALL remain marked as unread (idempotent, no stacking)

#### Scenario: Bell from any terminal tab in workspace
- **WHEN** a workspace has multiple terminal tabs and any one of them emits `\x07` while the workspace is not active
- **THEN** the workspace SHALL be marked as unread

### Requirement: Unread indicator displayed in sidebar
The system SHALL display a light blue filled circle indicator on workspace items in the sidebar when the workspace is marked as unread. The indicator SHALL use the `--accent-blue` color from the design system.

#### Scenario: Unread workspace visible in sidebar
- **WHEN** a workspace is marked as unread
- **THEN** a light blue dot indicator SHALL be visible on that workspace's sidebar item

#### Scenario: Non-unread workspace has no indicator
- **WHEN** a workspace is not marked as unread
- **THEN** no dot indicator SHALL be displayed on that workspace's sidebar item

#### Scenario: Active workspace with unread state
- **WHEN** a workspace is both active and has a residual unread mark (edge case)
- **THEN** the unread indicator SHALL NOT be displayed (active state takes precedence via dismissal)

### Requirement: Switching to workspace dismisses unread
The system SHALL clear the unread state of a workspace when the user switches to it.

#### Scenario: User clicks unread workspace in sidebar
- **WHEN** the user clicks on a workspace item that is marked as unread
- **THEN** the workspace SHALL become active AND the unread indicator SHALL be dismissed

#### Scenario: User switches via keyboard shortcut
- **WHEN** the user switches to an unread workspace via keyboard shortcut (next/prev workspace)
- **THEN** the unread indicator SHALL be dismissed for that workspace

### Requirement: Unread state is ephemeral
The system SHALL NOT persist unread state to disk. Unread state SHALL be lost on app restart.

#### Scenario: App restart clears unread state
- **WHEN** the app is restarted
- **THEN** no workspaces SHALL be marked as unread

#### Scenario: Workspace deletion cleans up unread state
- **WHEN** a workspace that is marked as unread is deleted
- **THEN** its unread state SHALL be removed from the store
