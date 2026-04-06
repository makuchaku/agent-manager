import { ipcMain, dialog, app, BrowserWindow, clipboard, type WebContents } from 'electron'
import { join, relative } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { watch, type FSWatcher } from 'fs'
import { IPC } from '../shared/ipc-channels'
import { PtyManager } from './pty-manager'
import { GitService } from './git-service'
import { GithubService } from './github-service'
import { FileService, type FileNode } from './file-service'

const ptyManager = new PtyManager()

// Request tracking for debugging
let requestCounter = 0
function generateRequestId(): string {
  return `req-${++requestCounter}-${Date.now()}`
}

interface FsWatchSubscriber {
  webContents: WebContents
  refs: number
}

interface FsWatcherEntry {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
  subscribers: Map<number, FsWatchSubscriber>
  totalRefs: number
}

const fsWatchers = new Map<string, FsWatcherEntry>()

interface StateSanitizeResult {
  data: unknown
  changed: boolean
}

interface ProjectLike {
  id: string
  repoPath: string
  branch?: string
}

interface TabLike {
  id: string
  projectId?: string
  workspaceId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Input validation helpers
function isValidPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (path.includes('\0')) return false // null bytes not allowed
  return path.length > 0 && path.length < 4096 // reasonable path length limit
}

function isProjectLike(value: unknown): value is ProjectLike {
  return isRecord(value) && typeof value.id === 'string' && typeof value.repoPath === 'string'
}

function isTabLike(value: unknown): value is TabLike {
  return isRecord(value) && typeof value.id === 'string' && (typeof value.projectId === 'string' || typeof value.workspaceId === 'string')
}

/**
 * Load JSON file with fallback value
 */
async function loadJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const { readFile } = await import('fs/promises')
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return fallback
  }
}

/**
 * Save JSON file
 */
async function saveJsonFile(filePath: string, data: unknown): Promise<void> {
  const { writeFile } = await import('fs/promises')
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function sanitizeLoadedState(data: unknown): StateSanitizeResult {
  if (!isRecord(data)) return { data, changed: false }

  // Migration from workspace-based to project-based state
  const rawWorkspaces = Array.isArray(data.workspaces) ? data.workspaces : null
  const rawProjects = Array.isArray(data.projects) ? data.projects : null

  // If we have old workspaces but no projects, migrate
  if (rawWorkspaces && rawWorkspaces.length > 0 && (!rawProjects || rawProjects.length === 0)) {
    const projectMap = new Map<string, { id: string; name: string; repoPath: string; branch: string }>()

    for (const ws of rawWorkspaces) {
      if (!isRecord(ws)) continue
      const wsId = ws.id as string
      const projectId = ws.projectId as string
      const repoPath = ws.worktreePath as string
      const branch = (ws.branch as string) || 'main'
      const name = (ws.name as string) || repoPath.split('/').pop() || 'Project'

      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, { id: projectId, name, repoPath, branch })
      }
    }

    const migratedProjects = Array.from(projectMap.values())
    const next: Record<string, unknown> = { ...data, projects: migratedProjects }

    // Use first project's id as active project
    if (migratedProjects.length > 0) {
      next.activeProjectId = migratedProjects[0].id
    }

    // Migrate tabs - workspaceId -> projectId
    const rawTabs = Array.isArray(data.tabs) ? data.tabs : null
    if (rawTabs) {
      const wsToProject = new Map<string, string>()
      for (const ws of rawWorkspaces) {
        if (isRecord(ws)) {
          wsToProject.set(ws.id as string, ws.projectId as string)
        }
      }
      const migratedTabs = rawTabs
        .filter((tab): tab is TabLike => isTabLike(tab) && (wsToProject.has(tab.projectId) || wsToProject.has(tab.workspaceId)))
        .map((tab) => ({
          ...tab,
          projectId: tab.projectId ?? wsToProject.get(tab.workspaceId ?? ''),
        }))
      next.tabs = migratedTabs
    }

    // Migrate lastActiveTabByWorkspace -> lastActiveTabByProject
    if (isRecord(data.lastActiveTabByWorkspace)) {
      const wsToProject = new Map<string, string>()
      for (const ws of rawWorkspaces) {
        if (isRecord(ws)) {
          wsToProject.set(ws.id as string, ws.projectId as string)
        }
      }
      const migrated = Object.fromEntries(
        Object.entries(data.lastActiveTabByWorkspace).map(([wsId, tabId]) => [
          wsToProject.get(wsId) || wsId,
          tabId,
        ])
      )
      next.lastActiveTabByProject = migrated
    }

    // Migrate lastActiveTabByProject (if exists from previous migration attempt)
    if (isRecord(data.lastActiveTabByProject)) {
      // Already migrated, keep as is
    }

    // Remove old workspace fields
    delete next.workspaces
    delete next.activeWorkspaceId

    return { data: next, changed: true }
  }

  // If projects exist but no branch field, add default branch
  if (rawProjects && rawProjects.length > 0) {
    const needsUpdate = rawProjects.some((p) => isProjectLike(p) && !p.branch)
    if (needsUpdate) {
      const next = { ...data }
      next.projects = rawProjects.map((p) => {
        if (isProjectLike(p) && !p.branch) {
          return { ...p, branch: 'main' }
        }
        return p
      })
      return { data: next, changed: true }
    }
  }

  return { data, changed: false }
}

export function registerIpcHandlers(): void {
  console.log('[ipc] Registering IPC handlers...')
  const registrationStart = Date.now()
  
  // Git handlers - operate on project repo path directly
  ipcMain.handle(IPC.GIT_GET_STATUS, async (_e, repoPath: string) => {
    if (!isValidPath(repoPath)) throw new Error('Invalid path')
    const start = performance.now()
    const result = await GitService.getStatus(repoPath)
    console.log(`[ipc] git:get-status took ${(performance.now() - start).toFixed(2)}ms`)
    return result
  })

  ipcMain.handle(IPC.GIT_GET_DIFF, async (_e, repoPath: string, staged: boolean) => {
    return GitService.getDiff(repoPath, staged)
  })

  ipcMain.handle(IPC.GIT_GET_FILE_DIFF, async (_e, repoPath: string, filePath: string) => {
    return GitService.getFileDiff(repoPath, filePath)
  })

  ipcMain.handle(IPC.GIT_GET_BRANCHES, async (_e, repoPath: string) => {
    return GitService.getBranches(repoPath)
  })

  ipcMain.handle(IPC.GIT_STAGE, async (_e, repoPath: string, paths: string[]) => {
    return GitService.stage(repoPath, paths)
  })

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_e, repoPath: string, paths: string[]) => {
    return GitService.unstage(repoPath, paths)
  })

  ipcMain.handle(IPC.GIT_DISCARD, async (_e, repoPath: string, paths: string[], untracked: string[]) => {
    return GitService.discard(repoPath, paths, untracked)
  })

  ipcMain.handle(IPC.GIT_COMMIT, async (_e, repoPath: string, message: string) => {
    return GitService.commit(repoPath, message)
  })

  ipcMain.handle(IPC.GIT_GET_CURRENT_BRANCH, async (_e, repoPath: string) => {
    return GitService.getCurrentBranch(repoPath)
  })

  ipcMain.handle(IPC.GIT_GET_DEFAULT_BRANCH, async (_e, repoPath: string) => {
    return GitService.getDefaultBranch(repoPath)
  })

  ipcMain.handle(IPC.GIT_CHECKOUT_BRANCH, async (_e, repoPath: string, branch: string) => {
    return GitService.checkoutBranch(repoPath, branch)
  })

  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (_e, repoPath: string, branch: string, baseBranch?: string) => {
    return GitService.createBranch(repoPath, branch, baseBranch)
  })

  // GitHub handlers
  ipcMain.handle(IPC.GITHUB_GET_PR_STATUSES, async (_e, repoPath: string, branches: string[]) => {
    return GithubService.getPrStatuses(repoPath, branches)
  })

  ipcMain.handle(IPC.GITHUB_LIST_OPEN_PRS, async (_e, repoPath: string) => {
    return GithubService.listOpenPrs(repoPath)
  })

  // PTY handlers
  ipcMain.handle(IPC.PTY_CREATE, async (_e, workingDir: string, shell?: string, extraEnv?: Record<string, string>) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (!win) throw new Error('No window found')
    return ptyManager.create(workingDir, win.webContents, shell, undefined, undefined, extraEnv)
  })

  ipcMain.on(IPC.PTY_WRITE, (_e, ptyId: string, data: string) => {
    ptyManager.write(ptyId, data)
  })

  ipcMain.on(IPC.PTY_RESIZE, (_e, ptyId: string, cols: number, rows: number) => {
    ptyManager.resize(ptyId, cols, rows)
  })

  ipcMain.on(IPC.PTY_DESTROY, (_e, ptyId: string) => {
    ptyManager.destroy(ptyId)
  })

  ipcMain.handle(IPC.PTY_LIST, async () => {
    return ptyManager.list()
  })

  ipcMain.handle(IPC.PTY_REATTACH, async (_e, ptyId: string, sinceSeq?: number) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (!win) throw new Error('No window found')
    return ptyManager.reattach(ptyId, win.webContents, sinceSeq)
  })

  // File handlers
  ipcMain.handle(IPC.FS_GET_TREE, async (_e, dirPath: string) => {
    return FileService.getTree(dirPath)
  })

  ipcMain.handle(IPC.FS_GET_TREE_WITH_STATUS, async (_e, dirPath: string) => {
    const [tree, statuses, topLevel] = await Promise.all([
      FileService.getTree(dirPath),
      GitService.getStatus(dirPath).catch(() => []),
      GitService.getTopLevel(dirPath).catch(() => dirPath),
    ])

    const prefix = relative(topLevel, dirPath)

    const statusMap = new Map<string, string>()
    for (const s of statuses) {
      let p = s.path
      if (p.includes(' -> ')) {
        p = p.split(' -> ')[1]
      }
      if (prefix && p.startsWith(prefix + '/')) {
        p = p.slice(prefix.length + 1)
      }
      statusMap.set(p, s.status)
    }

    function annotate(nodes: FileNode[]): boolean {
      let hasStatus = false
      for (const node of nodes) {
        const rel = node.path.startsWith(dirPath)
          ? node.path.slice(dirPath.length + 1)
          : node.path

        if (node.type === 'file') {
          const st = statusMap.get(rel)
          if (st) {
            node.gitStatus = st as FileNode['gitStatus']
            hasStatus = true
          }
        } else if (node.children) {
          const childHasStatus = annotate(node.children)
          if (childHasStatus) {
            node.gitStatus = 'modified'
            hasStatus = true
          }
        }
      }
      return hasStatus
    }

    annotate(tree)
    return tree
  })

  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    return FileService.readFile(filePath)
  })

  ipcMain.handle(IPC.FS_READ_FILE_BINARY, async (_e, filePath: string) => {
    const buffer = await FileService.readFileBinary(filePath)
    return buffer.toString('base64')
  })

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, filePath: string, content: string) => {
    return FileService.writeFile(filePath, content)
  })

  // Filesystem watcher handlers
  ipcMain.handle(IPC.FS_WATCH_START, (_e, dirPath: string) => {
    const senderId = _e.sender.id
    const existing = fsWatchers.get(dirPath)
    if (existing) {
      const subscriber = existing.subscribers.get(senderId)
      if (subscriber) {
        subscriber.refs += 1
      } else {
        existing.subscribers.set(senderId, { webContents: _e.sender, refs: 1 })
      }
      existing.totalRefs += 1
      return
    }

    try {
      const watcher = watch(dirPath, { recursive: true }, (_eventType, filename) => {
        if (filename && (filename.startsWith('.git/') || filename.startsWith('.git\\'))) {
          const f = filename.replaceAll('\\', '/')
          const isStateChange =
            f === '.git/index' || f === '.git/HEAD' || f.startsWith('.git/refs/')
          if (!isStateChange) return
        }

        const entry = fsWatchers.get(dirPath)
        if (!entry) return

        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = setTimeout(() => {
          for (const [id, subscriber] of entry.subscribers.entries()) {
            if (subscriber.webContents.isDestroyed()) {
              entry.totalRefs = Math.max(0, entry.totalRefs - subscriber.refs)
              entry.subscribers.delete(id)
              continue
            }
            subscriber.webContents.send(IPC.FS_WATCH_CHANGED, dirPath)
          }

          if (entry.totalRefs <= 0 || entry.subscribers.size === 0) {
            if (entry.timer) clearTimeout(entry.timer)
            entry.watcher.close()
            fsWatchers.delete(dirPath)
          }
        }, 500)
      })

      fsWatchers.set(dirPath, {
        watcher,
        timer: null,
        subscribers: new Map([[senderId, { webContents: _e.sender, refs: 1 }]]),
        totalRefs: 1,
      })
    } catch {
      // Directory may not exist or be inaccessible
    }
  })

  ipcMain.on(IPC.FS_WATCH_STOP, (_e, dirPath: string) => {
    const entry = fsWatchers.get(dirPath)
    if (!entry) return

    const senderId = _e.sender.id
    const subscriber = entry.subscribers.get(senderId)
    if (subscriber) {
      subscriber.refs -= 1
      entry.totalRefs = Math.max(0, entry.totalRefs - 1)
      if (subscriber.refs <= 0) {
        entry.subscribers.delete(senderId)
      }
    } else {
      entry.totalRefs = Math.max(0, entry.totalRefs - 1)
    }

    if (entry.totalRefs <= 0 || entry.subscribers.size === 0) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.watcher.close()
      fsWatchers.delete(dirPath)
    }
  })

  // App handlers
  ipcMain.handle(IPC.APP_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.APP_SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Open File',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.APP_ADD_PROJECT_PATH, async (_e, dirPath: string) => {
    const { stat } = await import('fs/promises')
    try {
      const s = await stat(dirPath)
      if (!s.isDirectory()) return null
      return dirPath
    } catch {
      return null
    }
  })
  /**
   * Clipboard handlers - IMAGE OPERATIONS ONLY
   * 
   * Note: Text clipboard operations (copy/paste) use SYSTEM DEFAULTS and are NOT
   * handled here. The renderer process relies on:
   * 1. xterm.js native copy/paste handling for the terminal
   * 2. Electron's built-in clipboard API accessible in renderer
   * 3. Standard Edit menu roles (copy, paste) in main/index.ts
   * 
   * Only image clipboard operations are handled here since they require:
   * - Reading image data from the system clipboard
   * - Saving to a temporary file
   * - Returning the file path to the renderer
   */
  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, async () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    const buf = img.toPNG()
    const filePath = join(tmpdir(), `mickey-paste-${Date.now()}.png`)
    await writeFile(filePath, buf)
    return filePath
  })

  // State persistence handlers
  const stateFilePath = () =>
    join(app.getPath('userData'), 'mickey-state.json')

  ipcMain.handle(IPC.STATE_SAVE, async (_e, data: unknown) => {
    await mkdir(app.getPath('userData'), { recursive: true })
    await saveJsonFile(stateFilePath(), data)
  })

  ipcMain.on(IPC.STATE_SAVE_SYNC, (event, data: unknown) => {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(stateFilePath(), JSON.stringify(data, null, 2), 'utf-8')
      event.returnValue = true
    } catch {
      event.returnValue = false
    }
  })

  ipcMain.handle(IPC.STATE_LOAD, async () => {
    const loaded = await loadJsonFile(stateFilePath(), null)
    const sanitized = sanitizeLoadedState(loaded)
    if (sanitized.changed) {
      await saveJsonFile(stateFilePath(), sanitized.data).catch(() => {})
      console.info('[state] migrated from workspace-based to project-based format')
    }
    return sanitized.data
  })
}
