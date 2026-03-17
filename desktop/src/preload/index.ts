import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { PrLookupResult, ListOpenPrsResult } from '../shared/github-types'

const api = {
  git: {
    getStatus: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_STATUS, repoPath),
    getDiff: (repoPath: string, staged: boolean) =>
      ipcRenderer.invoke(IPC.GIT_GET_DIFF, repoPath, staged),
    getFileDiff: (repoPath: string, filePath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_FILE_DIFF, repoPath, filePath),
    getBranches: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_BRANCHES, repoPath),
    stage: (repoPath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_STAGE, repoPath, paths),
    unstage: (repoPath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE, repoPath, paths),
    discard: (repoPath: string, paths: string[], untracked: string[]) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD, repoPath, paths, untracked),
    commit: (repoPath: string, message: string) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, repoPath, message),
    getCurrentBranch: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_CURRENT_BRANCH, repoPath) as Promise<string>,
    getDefaultBranch: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GIT_GET_DEFAULT_BRANCH, repoPath) as Promise<string>,
    checkoutBranch: (repoPath: string, branch: string) =>
      ipcRenderer.invoke(IPC.GIT_CHECKOUT_BRANCH, repoPath, branch),
    createBranch: (repoPath: string, branch: string, baseBranch?: string) =>
      ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, repoPath, branch, baseBranch),
  },

  pty: {
    create: (workingDir: string, shell?: string, extraEnv?: Record<string, string>) =>
      ipcRenderer.invoke(IPC.PTY_CREATE, workingDir, shell, extraEnv),
    write: (ptyId: string, data: string) =>
      ipcRenderer.send(IPC.PTY_WRITE, ptyId, data),
    resize: (ptyId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.PTY_RESIZE, ptyId, cols, rows),
    destroy: (ptyId: string) =>
      ipcRenderer.send(IPC.PTY_DESTROY, ptyId),
    list: () =>
      ipcRenderer.invoke(IPC.PTY_LIST) as Promise<string[]>,
    reattach: (ptyId: string, sinceSeq?: number) =>
      ipcRenderer.invoke(IPC.PTY_REATTACH, ptyId, sinceSeq) as Promise<{ ok: boolean; replay?: string; baseSeq: number; endSeq: number; truncated: boolean; cols: number; rows: number }>,
    onData: (ptyId: string, callback: (data: string, startSeq?: number) => void) => {
      const channel = `${IPC.PTY_DATA}:${ptyId}`
      const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        if (typeof args[0] === 'number' && typeof args[1] === 'string') {
          callback(args[1], args[0])
          return
        }
        if (typeof args[0] === 'string') {
          callback(args[0])
        }
      }
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.removeListener(channel, listener)
      }
    },
  },

  fs: {
    getTree: (dirPath: string) =>
      ipcRenderer.invoke(IPC.FS_GET_TREE, dirPath),
    getTreeWithStatus: (dirPath: string) =>
      ipcRenderer.invoke(IPC.FS_GET_TREE_WITH_STATUS, dirPath),
    readFile: (filePath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),
    watchDir: (dirPath: string) =>
      ipcRenderer.invoke(IPC.FS_WATCH_START, dirPath),
    unwatchDir: (dirPath: string) =>
      ipcRenderer.send(IPC.FS_WATCH_STOP, dirPath),
    onDirChanged: (callback: (dirPath: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, dirPath: string) => callback(dirPath)
      ipcRenderer.on(IPC.FS_WATCH_CHANGED, listener)
      return () => {
        ipcRenderer.removeListener(IPC.FS_WATCH_CHANGED, listener)
      }
    },
  },

  app: {
    selectDirectory: () =>
      ipcRenderer.invoke(IPC.APP_SELECT_DIRECTORY),
    addProjectPath: (dirPath: string) =>
      ipcRenderer.invoke(IPC.APP_ADD_PROJECT_PATH, dirPath),
  },

  agent: {
    onNotifyProject: (callback: (projectId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, projectId: string) => callback(projectId)
      ipcRenderer.on(IPC.AGENT_NOTIFY_PROJECT, listener)
      return () => {
        ipcRenderer.removeListener(IPC.AGENT_NOTIFY_PROJECT, listener)
      }
    },
    onActivityUpdate: (callback: (projectIds: string[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, projectIds: string[]) => callback(projectIds)
      ipcRenderer.on(IPC.AGENT_ACTIVITY_UPDATE, listener)
      return () => {
        ipcRenderer.removeListener(IPC.AGENT_ACTIVITY_UPDATE, listener)
      }
    },
  },

  claude: {
    trustPath: (dirPath: string) =>
      ipcRenderer.invoke(IPC.CLAUDE_TRUST_PATH, dirPath),
    installHooks: () =>
      ipcRenderer.invoke(IPC.CLAUDE_INSTALL_HOOKS),
    uninstallHooks: () =>
      ipcRenderer.invoke(IPC.CLAUDE_UNINSTALL_HOOKS),
    checkHooks: () =>
      ipcRenderer.invoke(IPC.CLAUDE_CHECK_HOOKS),
  },

  codex: {
    installNotify: () =>
      ipcRenderer.invoke(IPC.CODEX_INSTALL_NOTIFY),
    uninstallNotify: () =>
      ipcRenderer.invoke(IPC.CODEX_UNINSTALL_NOTIFY),
    checkNotify: () =>
      ipcRenderer.invoke(IPC.CODEX_CHECK_NOTIFY),
  },

  pi: {
    installActivityExtension: () =>
      ipcRenderer.invoke(IPC.PI_INSTALL_ACTIVITY_EXTENSION),
    uninstallActivityExtension: () =>
      ipcRenderer.invoke(IPC.PI_UNINSTALL_ACTIVITY_EXTENSION),
    checkActivityExtension: () =>
      ipcRenderer.invoke(IPC.PI_CHECK_ACTIVITY_EXTENSION),
  },

   ui: {
     onResetLayout: (callback: () => void) => {
       const listener = (_event: Electron.IpcRendererEvent) => callback()
       ipcRenderer.on(IPC.UI_RESET_LAYOUT, listener)
       return () => {
         ipcRenderer.removeListener(IPC.UI_RESET_LAYOUT, listener)
       }
     },
   },

  github: {
    getPrStatuses: (repoPath: string, branches: string[]) =>
      ipcRenderer.invoke(IPC.GITHUB_GET_PR_STATUSES, repoPath, branches) as Promise<PrLookupResult>,
    listOpenPrs: (repoPath: string) =>
      ipcRenderer.invoke(IPC.GITHUB_LIST_OPEN_PRS, repoPath) as Promise<ListOpenPrsResult>,
  },

  /**
   * Clipboard API - IMAGE OPERATIONS ONLY
   * 
   * Note: Text copy/paste operations use SYSTEM DEFAULTS and are NOT exposed here.
   * The app intentionally does not provide custom text clipboard APIs because:
   * 1. xterm.js handles copy/paste natively with standard terminal behavior
   * 2. Electron's built-in clipboard API works automatically in the renderer
   * 3. System defaults work correctly across platforms (macOS, Linux, WSL)
   * 
   * Only image clipboard operations are exposed here since they require special
   * handling (saving to temp files) that the terminal component uses.
   */
  clipboard: {
    /**
     * Saves an image from the clipboard to a temporary file.
     * Used by the terminal when pasting images (Ctrl+Shift+V or similar).
     * Returns the path to the saved image file, or null if no image in clipboard.
     */
    saveImage: () =>
      ipcRenderer.invoke(IPC.CLIPBOARD_SAVE_IMAGE) as Promise<string | null>,
  },

  state: {
    save: (data: unknown) =>
      ipcRenderer.invoke(IPC.STATE_SAVE, data),
    saveSync: (data: unknown) =>
      ipcRenderer.sendSync(IPC.STATE_SAVE_SYNC, data) as boolean,
    load: () =>
      ipcRenderer.invoke(IPC.STATE_LOAD),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
