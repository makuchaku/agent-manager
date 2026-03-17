import type { PrInfo } from '@shared/github-types'

export interface StartupCommand {
  name: string
  command: string
}

export interface Project {
  id: string
  name: string
  repoPath: string
  branch: string
  startupCommands?: StartupCommand[]
  prLinkProvider?: PrLinkProvider
}

export type Tab = {
  id: string
  projectId: string
} & (
  | { type: 'terminal'; title: string; ptyId: string }
  | { type: 'file'; filePath: string; unsaved?: boolean }
  | { type: 'diff' }
)

export type RightPanelMode = 'gemini' | 'files' | 'changes'

/**
 * Split direction for pane layout
 * - 'vertical': side-by-side (left/right)
 * - 'horizontal': stacked (top/bottom)
 */
export type SplitDirection = 'vertical' | 'horizontal'

/**
 * TabGroup — Leaf node in the pane tree containing a set of tabs
 */
export interface TabGroup {
  id: string
  type: 'tabGroup'
  tabs: Tab[]
  activeTabId: string | null
}

/**
 * Split — Branch node in the pane tree containing two child panes
 */
export interface Split {
  id: string
  type: 'split'
  direction: SplitDirection
  children: [Pane, Pane] // Exactly two children
  splitRatio: number // 0.0-1.0 representing first child's percentage
}

/**
 * Pane — Union type representing either a TabGroup (leaf) or Split (branch)
 */
export type Pane = TabGroup | Split

/**
 * ProjectLayout — The layout state for a single project
 * Uses a recursive tree structure where each node is either a TabGroup or Split
 */
export interface ProjectLayout {
  rootPane: Pane
  activePaneId: string | null
}

export type PrLinkProvider = 'github' | 'graphite' | 'devinreview'

export type Theme = 'dark' | 'light'

export interface Settings {
  confirmOnClose: boolean
  autoSaveOnBlur: boolean
  defaultShell: string
  restoreProject: boolean
  diffInline: boolean
  terminalFontSize: number
  editorFontSize: number
  uiFontSize: number
  terminalStartupCommand: string
  theme: Theme
  editorTheme: string
}

export const DEFAULT_SETTINGS: Settings = {
  confirmOnClose: true,
  autoSaveOnBlur: false,
  defaultShell: '',
  restoreProject: true,
  diffInline: false,
  terminalFontSize: 22,
  editorFontSize: 22,
  uiFontSize: 18,
  terminalStartupCommand: 'opencode',
  theme: 'light',
  editorTheme: 'vs',
}

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

export interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export interface AppState {
  projects: Project[]
  tabs: Tab[]
  activeProjectId: string | null
  activeTabId: string | null
  lastActiveTabByProject: Record<string, string>
  rightPanelMode: Record<string, RightPanelMode>
  rightPanelOpen: Record<string, boolean>
  rightPanelSize: Record<string, number>
  sidebarCollapsed: boolean
  lastSavedTabId: string | null
  settings: Settings
  settingsOpen: boolean
  confirmDialog: ConfirmDialogState | null
  toasts: Toast[]
  quickOpenVisible: boolean
  unreadProjectIds: Set<string>
  activeAgentProjectIds: Set<string>
  prStatusMap: Map<string, PrInfo | null>
  ghAvailability: Map<string, boolean>

  /**
   * Project layouts — per-project pane tree structure
   * Each project has a recursive tree of TabGroups and Splits
   * This enables split views within a project
   */
  projectLayouts: Record<string, ProjectLayout>

  /**
   * ID of the currently focused pane (TabGroup)
   * Used for split operations to know which pane to split
   */
  activePaneId: string | null

  addProject: (project: Project) => Promise<void>
  removeProject: (id: string) => void
  updateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (projectId: string) => Promise<void>
  checkoutBranch: (projectId: string, branch: string) => Promise<void>
  createBranch: (projectId: string, branch: string, baseBranch?: string) => Promise<void>

  addTab: (tab: Tab) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  moveTabInActiveProject: (sourceTabId: string, targetTabId: string) => void
  setTerminalTitleFromCommand: (ptyId: string, command: string) => void
  setRightPanelMode: (mode: RightPanelMode) => void
  toggleRightPanel: () => void
  setRightPanelSize: (size: number) => void
  toggleSidebar: () => void
  nextTab: () => void
  prevTab: () => void
  createTerminalForActiveProject: () => Promise<void>
  closeActiveTab: () => void
  setTabUnsaved: (tabId: string, unsaved: boolean) => void
  notifyTabSaved: (tabId: string) => void
  openFileTab: (filePath: string) => void
  openDiffTab: (projectId: string) => void
  switchToTabByIndex: (index: number) => void
  closeAllProjectTabs: () => void
  focusOrCreateTerminal: () => Promise<void>

  updateSettings: (partial: Partial<Settings>) => void
  toggleSettings: () => void
  showConfirmDialog: (dialog: ConfirmDialogState) => void
  dismissConfirmDialog: () => void
  addToast: (toast: Toast) => void
  dismissToast: (id: string) => void
  toggleQuickOpen: () => void
  closeQuickOpen: () => void

  markProjectUnread: (projectId: string) => void
  clearProjectUnread: (projectId: string) => void
   setActiveAgentProjects: (projectIds: string[]) => void
   resetUILayout: () => void

  setPrStatuses: (projectId: string, statuses: Record<string, PrInfo | null>) => void
  setGhAvailability: (projectId: string, available: boolean) => void

  hydrateState: (data: PersistedState) => void

  activeProjectTabs: () => Tab[]
  activeProject: () => Project | undefined

  /**
   * Split the active tab into two panes
   * @param direction 'vertical' for side-by-side, 'horizontal' for top-bottom
   * @param tabId Optional tab ID to split (defaults to activeTabId)
   */
  splitCurrentTab: (direction: SplitDirection, tabId?: string) => void

  /**
   * Set the active pane ID when user clicks into a TabGroup
   */
  setActivePaneId: (paneId: string | null) => void

  /**
   * Update the layout for a specific project
   */
  updateProjectLayout: (projectId: string, layout: ProjectLayout) => void

  /**
   * Find the TabGroup pane ID that contains a specific tab
   */
  getTabPaneId: (tabId: string) => string | null
}

export interface PersistedState {
  projects: Project[]
  tabs?: Tab[]
  activeProjectId?: string | null
  activeTabId?: string | null
  lastActiveTabByProject?: Record<string, string>
  settings?: Settings
  rightPanelMode?: Record<string, RightPanelMode>
  rightPanelOpen?: Record<string, boolean>
  rightPanelSize?: Record<string, number>
  /**
   * Per-project pane tree layouts for split views
   * If undefined, will be migrated from flat tabs on load
   */
  projectLayouts?: Record<string, ProjectLayout>
}
