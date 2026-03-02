## ADDED Requirements

### Requirement: Staged and unstaged sections
The changes panel SHALL display two sections: "Staged Changes" and "Changes" (unstaged). Each section SHALL show a file count and only render when it has files. Files that are both staged and unstaged SHALL appear in both sections.

#### Scenario: File is only unstaged
- **WHEN** a file has unstaged modifications only (e.g., porcelain ` M`)
- **THEN** it appears only in the "Changes" section

#### Scenario: File is only staged
- **WHEN** a file has staged modifications only (e.g., porcelain `M `)
- **THEN** it appears only in the "Staged Changes" section

#### Scenario: File is both staged and unstaged
- **WHEN** a file has both staged and unstaged modifications (e.g., porcelain `MM`)
- **THEN** it appears in both "Staged Changes" and "Changes" sections

#### Scenario: Untracked file
- **WHEN** a file is untracked (porcelain `??`)
- **THEN** it appears only in the "Changes" section

#### Scenario: No changed files
- **WHEN** there are no changed files
- **THEN** the panel shows a "No changes" empty state with a checkmark

### Requirement: Stage individual file
The system SHALL provide a `+` action button on each file row in the "Changes" section. Clicking it SHALL stage that file via `git add -- <path>`.

#### Scenario: Stage a modified file
- **WHEN** user clicks `+` on an unstaged modified file
- **THEN** the system runs `git add -- <path>` and refreshes the file list
- **THEN** the file moves to the "Staged Changes" section

#### Scenario: Stage an untracked file
- **WHEN** user clicks `+` on an untracked file
- **THEN** the system runs `git add -- <path>` and refreshes the file list
- **THEN** the file appears in the "Staged Changes" section with status "added"

### Requirement: Unstage individual file
The system SHALL provide a `−` action button on each file row in the "Staged Changes" section. Clicking it SHALL unstage that file via `git reset HEAD -- <path>`.

#### Scenario: Unstage a staged file
- **WHEN** user clicks `−` on a staged file
- **THEN** the system runs `git reset HEAD -- <path>` and refreshes the file list
- **THEN** the file moves to the "Changes" section

### Requirement: Stage all files
The "Changes" section header SHALL have a `+` button. Clicking it SHALL stage all unstaged files at once.

#### Scenario: Stage all unstaged files
- **WHEN** user clicks `+` on the "Changes" section header
- **THEN** the system runs `git add -- <all unstaged paths>` and refreshes
- **THEN** all files move to the "Staged Changes" section

### Requirement: Unstage all files
The "Staged Changes" section header SHALL have a `−` button. Clicking it SHALL unstage all staged files at once.

#### Scenario: Unstage all staged files
- **WHEN** user clicks `−` on the "Staged Changes" section header
- **THEN** the system runs `git reset HEAD -- <all staged paths>` and refreshes
- **THEN** all files move to the "Changes" section

### Requirement: Discard unstaged changes
Each file row in the "Changes" section SHALL have a discard button (`↩`). Clicking it SHALL revert the file to its last committed state.

#### Scenario: Discard a tracked modified file
- **WHEN** user clicks discard on a tracked modified file
- **THEN** the system runs `git checkout -- <path>` and refreshes
- **THEN** the file is removed from the changes list

#### Scenario: Discard an untracked file
- **WHEN** user clicks discard on an untracked file
- **THEN** the system runs `git clean -f -- <path>` and refreshes
- **THEN** the file is removed from the changes list

### Requirement: Commit staged changes
The changes panel SHALL display a commit message textarea and "Commit" button above the staged section. The commit button SHALL be disabled when the commit message is empty or there are no staged files.

#### Scenario: Successful commit
- **WHEN** user types a commit message and clicks "Commit" with staged files present
- **THEN** the system runs `git commit -m <message>` and refreshes
- **THEN** the commit message input is cleared
- **THEN** committed files are removed from the staged section

#### Scenario: Commit button disabled — no staged files
- **WHEN** there are no files in the "Staged Changes" section
- **THEN** the "Commit" button is disabled

#### Scenario: Commit button disabled — empty message
- **WHEN** the commit message textarea is empty
- **THEN** the "Commit" button is disabled

### Requirement: Action buttons visible on hover
File-level action buttons (`+`, `−`, `↩`) SHALL be hidden by default and appear when the user hovers over the file row. Section-level action buttons SHALL always be visible.

#### Scenario: Hover reveals file actions
- **WHEN** user hovers over a file row in either section
- **THEN** the action buttons for that row become visible

#### Scenario: Section actions always visible
- **WHEN** the section header is rendered
- **THEN** the section-level `+` or `−` button is always visible

### Requirement: Click file to open diff
Clicking on a file name/path (not an action button) SHALL continue to open the diff viewer, preserving existing behavior.

#### Scenario: Click file opens diff
- **WHEN** user clicks on the file name in either section
- **THEN** the diff tab opens and scrolls to that file

### Requirement: Refresh after filesystem changes
The file list SHALL continue to auto-refresh when filesystem changes are detected, preserving existing behavior.

#### Scenario: External file change triggers refresh
- **WHEN** a file in the worktree is modified externally
- **THEN** the staged/unstaged file lists refresh automatically
