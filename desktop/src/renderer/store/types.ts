import type { PrInfo } from '@shared/github-types'

export interface StartupCommand {
  name: string
  command: string
}

export interface Automation {
  id: string
  name: string
  projectId: string
  prompt: string
  cronExpression: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'failed' | 'timeout'
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
  terminalFontSize: 14,
  editorFontSize: 13,
  uiFontSize: 12,
  terminalStartupCommand: '',
  theme: 'dark',
  editorTheme: 'vs-dark',
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
  automations: Automation[]
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
  automationsOpen: boolean
  confirmDialog: ConfirmDialogState | null
  toasts: Toast[]
  quickOpenVisible: boolean
  unreadProjectIds: Set<string>
  activeAgentProjectIds: Set<string>
  prStatusMap: Map<string, PrInfo | null>
  ghAvailability: Map<string, boolean>

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
  toggleAutomations: () => void
  showConfirmDialog: (dialog: ConfirmDialogState) => void
  dismissConfirmDialog: () => void
  addToast: (toast: Toast) => void
  dismissToast: (id: string) => void
  toggleQuickOpen: () => void
  closeQuickOpen: () => void

  markProjectUnread: (projectId: string) => void
  clearProjectUnread: (projectId: string) => void
  setActiveAgentProjects: (projectIds: string[]) => void

  setPrStatuses: (projectId: string, statuses: Record<string, PrInfo | null>) => void
  setGhAvailability: (projectId: string, available: boolean) => void

  addAutomation: (automation: Automation) => void
  updateAutomation: (id: string, partial: Partial<Omit<Automation, 'id'>>) => void
  removeAutomation: (id: string) => void

  hydrateState: (data: PersistedState) => void

  activeProjectTabs: () => Tab[]
  activeProject: () => Project | undefined
}

export interface PersistedState {
  projects: Project[]
  tabs?: Tab[]
  automations?: Automation[]
  activeProjectId?: string | null
  activeTabId?: string | null
  lastActiveTabByProject?: Record<string, string>
  settings?: Settings
  rightPanelMode?: Record<string, RightPanelMode>
  rightPanelOpen?: Record<string, boolean>
  rightPanelSize?: Record<string, number>
}
