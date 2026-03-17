// IPC channel constants shared between main and renderer

export const IPC = {
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

  // PTY operations
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DESTROY: 'pty:destroy',
  PTY_LIST: 'pty:list',
  PTY_REATTACH: 'pty:reattach',
  PTY_DATA: 'pty:data', // prefix for events: `pty:data:{id}`

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
   STATE_SAVE_SYNC: 'state:save-sync',
   STATE_LOAD: 'state:load',

   // UI operations
   UI_RESET_LAYOUT: 'ui:reset-layout',
} as const
