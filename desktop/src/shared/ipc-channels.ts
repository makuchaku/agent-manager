// IPC channel constants shared between main and renderer
// CHANNEL_VERSION is used for future migrations if needed
export const CHANNEL_VERSION = 1
export const MAX_CHANNEL_LENGTH = 64

export const IPC = {
  // ============================================================================
  // GIT OPERATIONS - Repository and version control
  // ============================================================================
  // Git operations
  GIT_GET_STATUS: 'git:get-status',
  GIT_GET_DIFF: 'git:get-diff',
  GIT_GET_FILE_DIFF: 'git:get-file-diff',
  GIT_GET_BRANCHES: 'git:get-branches',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_DISCARD: 'git:discard',
  GIT_COMMIT: 'git:commit',
  GIT_GET_CURRENT_BRANCH: 'git:get-current-branch',
  GIT_GET_DEFAULT_BRANCH: 'git:get-default-branch',
  GIT_CHECKOUT_BRANCH: 'git:checkout-branch',
  GIT_CREATE_BRANCH: 'git:create-branch',

  // ============================================================================
  // PTY OPERATIONS - Terminal emulation
  // ============================================================================
  // PTY operations
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DESTROY: 'pty:destroy',
  PTY_LIST: 'pty:list',
  PTY_REATTACH: 'pty:reattach',
  PTY_DATA: 'pty:data', // prefix for events: `pty:data:{id}`

  // ============================================================================
  // FILE OPERATIONS - Filesystem access
  // ============================================================================
  // File operations
  FS_GET_TREE: 'fs:get-tree',
  FS_GET_TREE_WITH_STATUS: 'fs:get-tree-with-status',
  FS_READ_FILE: 'fs:read-file',
  FS_READ_FILE_BINARY: 'fs:read-file-binary',
  FS_WRITE_FILE: 'fs:write-file',
  FS_WATCH_START: 'fs:watch-start',
  FS_WATCH_STOP: 'fs:watch-stop',
  FS_WATCH_CHANGED: 'fs:watch-changed',

  // App operations
  APP_SELECT_DIRECTORY: 'app:select-directory',
  APP_SELECT_FILE: 'app:select-file',
  APP_ADD_PROJECT_PATH: 'app:add-project-path',

  // GitHub operations
  GITHUB_GET_PR_STATUSES: 'github:get-pr-statuses',
  GITHUB_LIST_OPEN_PRS: 'github:list-open-prs',

  // Clipboard operations
  CLIPBOARD_SAVE_IMAGE: 'clipboard:save-image',

   // State persistence
   STATE_SAVE: 'state:save',
   STATE_SAVE_RECOVERY: 'state:save-recovery',
   STATE_SAVE_SYNC: 'state:save-sync',
   STATE_SAVE_RECOVERY_SYNC: 'state:save-recovery-sync',
   STATE_CLEAR_RECOVERY_SYNC: 'state:clear-recovery-sync',
   STATE_LOAD: 'state:load',
   STATE_LOAD_RECOVERY_SYNC: 'state:load-recovery-sync',
   STATE_LOAD_BOOT_THEME_SYNC: 'state:load-boot-theme-sync',

    // UI operations
    UI_RESET_LAYOUT: 'ui:reset-layout',
} as const
