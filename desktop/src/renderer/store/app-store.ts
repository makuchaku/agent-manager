import { create } from 'zustand'
import type { AppState, PersistedState, Tab, ProjectLayout, SplitDirection, Pane } from './types'
import { DEFAULT_SETTINGS } from './types'
import { titleFromTerminalCommand } from './terminal-tab-title'
import { 
  createTabGroup, 
  findTabGroupContainingTab,
  setActiveTabInTree,
  collectAllTabGroups
} from './layout-ops'

const DEFAULT_PR_LINK_PROVIDER = 'github' as const

/**
 * Helper: Add a tab to a specific TabGroup in the pane tree
 */
export function addTabToPane(root: Pane, paneId: string, tab: Tab): Pane {
  if (root.type === 'tabGroup' && root.id === paneId) {
    return {
      ...root,
      tabs: [...root.tabs, tab],
      activeTabId: tab.id
    }
  }
  if (root.type === 'split') {
    const newChild0 = addTabToPane(root.children[0], paneId, tab)
    const newChild1 = addTabToPane(root.children[1], paneId, tab)
    
    // If one child is now empty after our operation, collapse to the other
    if (newChild0.type === 'tabGroup' && newChild0.tabs.length === 0) {
      return newChild1
    }
    if (newChild1.type === 'tabGroup' && newChild1.tabs.length === 0) {
      return newChild0
    }
    
    return {
      ...root,
      children: [newChild0, newChild1] as [Pane, Pane]
    }
  }
  return root
}

/**
 * Helper: Remove a tab from the pane tree
 * Returns null if the resulting TabGroup is empty (so it can be collapsed)
 */
function removeTabFromPane(root: Pane, tabId: string): Pane | null {
  if (root.type === 'tabGroup') {
    const newTabs = root.tabs.filter((t) => t.id !== tabId)
    
    // If this TabGroup becomes empty, return null to signal removal
    if (newTabs.length === 0) {
      return null
    }
    
    const newActiveTabId = root.activeTabId === tabId 
      ? (newTabs[0]?.id ?? null)
      : root.activeTabId
    return {
      ...root,
      tabs: newTabs,
      activeTabId: newActiveTabId
    }
  }
  if (root.type === 'split') {
    const newChild0 = removeTabFromPane(root.children[0], tabId)
    const newChild1 = removeTabFromPane(root.children[1], tabId)
    
    // If one child is null (empty), collapse to the other
    if (newChild0 === null && newChild1 === null) {
      return null // Both empty, this split should also be removed
    }
    if (newChild0 === null) {
      return newChild1
    }
    if (newChild1 === null) {
      return newChild0
    }
    
    return {
      ...root,
      children: [newChild0, newChild1] as [Pane, Pane]
    }
  }
  return root
}

function executeTerminalStartupCommand(ptyId: string, command: string) {
  if (!command.trim()) return
  setTimeout(() => {
    window.api.pty.write(ptyId, command + '\r\n')
  }, 500)
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  tabs: [],
  activeProjectId: null,
  activeTabId: null,
  lastActiveTabByProject: {},
  rightPanelMode: {},
  rightPanelOpen: {},
  rightPanelSize: {},
  sidebarCollapsed: false,
  lastSavedTabId: null,
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
  confirmDialog: null,
  toasts: [],
  quickOpenVisible: false,
  unreadProjectIds: new Set<string>(),
  prStatusMap: new Map(),
  ghAvailability: new Map(),
  
  /**
   * Project layouts — per-project pane tree structure for split views
   * Each project has a recursive tree of TabGroups and Splits
   */
  projectLayouts: {},
  
  /**
   * ID of the currently focused pane (TabGroup)
   * Used to know which pane to split when user clicks split button
   */
  activePaneId: null,

  addProject: async (project) => {
    set((s) => ({
      projects: [
        ...s.projects,
        {
          ...project,
          prLinkProvider: project.prLinkProvider ?? DEFAULT_PR_LINK_PROVIDER,
        },
      ],
    }))
  },

  removeProject: (id) =>
    set((s) => {
      const newProjects = s.projects.filter((p) => p.id !== id)
      const newTabs = s.tabs.filter((t) => t.projectId !== id)
      const newUnread = new Set(Array.from(s.unreadProjectIds).filter((pid) => pid !== id))
      const newPrStatusMap = new Map(
        Array.from(s.prStatusMap.entries()).filter(([key]) => !key.startsWith(`${id}:`))
      )
      const newGhAvailability = new Map(s.ghAvailability)
      newGhAvailability.delete(id)

      const tabMap = { ...s.lastActiveTabByProject }
      delete tabMap[id]

      const activeProjectId =
        s.activeProjectId === id
          ? (newProjects[0]?.id ?? null)
          : s.activeProjectId
      const activeTabId = newTabs.some((t) => t.id === s.activeTabId)
        ? s.activeTabId
        : (newTabs.find((t) => t.projectId === activeProjectId)?.id ?? newTabs[0]?.id ?? null)

      return {
        projects: newProjects,
        tabs: newTabs,
        unreadProjectIds: newUnread,
        prStatusMap: newPrStatusMap,
        ghAvailability: newGhAvailability,
        activeProjectId,
        activeTabId,
        lastActiveTabByProject: tabMap,
      }
    }),

  setActiveProject: (id) =>
    set((s) => {
      const tabMap = { ...s.lastActiveTabByProject }
      if (s.activeProjectId && s.activeTabId) {
        tabMap[s.activeProjectId] = s.activeTabId
      }

      const projectTabs = s.tabs.filter((t) => t.projectId === id)
      const newUnread = new Set(s.unreadProjectIds)
      if (id) newUnread.delete(id)

      const remembered = id ? tabMap[id] : null
      const activeTabId = remembered && projectTabs.some((t) => t.id === remembered)
        ? remembered
        : projectTabs[0]?.id ?? null

      return {
        activeProjectId: id,
        activeTabId,
        lastActiveTabByProject: tabMap,
        unreadProjectIds: newUnread,
      }
    }),

  addTab: (tab) =>
    set((s) => {
      console.log('[addTab] Adding tab:', tab.type, tab.id, 'to project:', s.activeProjectId)
      console.log('[addTab] Current projectLayouts:', s.projectLayouts[s.activeProjectId || ''] ? 'exists' : 'none')
      console.log('[addTab] activePaneId:', s.activePaneId)
      
      const newState: Partial<AppState> = {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }
      
      // If we have a layout for this project, add the tab to the layout tree
      if (s.activeProjectId && s.projectLayouts[s.activeProjectId]) {
        const layout = s.projectLayouts[s.activeProjectId]
        const targetPaneId = s.activePaneId || layout.activePaneId
        
        console.log('[addTab] targetPaneId:', targetPaneId)
        
        if (targetPaneId) {
          // Add tab to the specific pane in the layout tree
          console.log('[addTab] Adding to existing pane:', targetPaneId)
          newState.projectLayouts = {
            ...s.projectLayouts,
            [s.activeProjectId]: {
              ...layout,
              rootPane: addTabToPane(layout.rootPane, targetPaneId, tab)
            }
          }
        } else {
          // BUG FIX: If no active pane, add to the first available TabGroup
          // This ensures the tab appears in the UI even when no pane is explicitly focused
          console.log('[addTab] No targetPaneId, finding first TabGroup...')
          const allTabGroups = collectAllTabGroups(layout.rootPane)
          console.log('[addTab] Found TabGroups:', allTabGroups.length)
          if (allTabGroups.length > 0) {
            const firstTabGroup = allTabGroups[0]
            console.log('[addTab] Adding to first TabGroup:', firstTabGroup.id)
            newState.projectLayouts = {
              ...s.projectLayouts,
              [s.activeProjectId]: {
                ...layout,
                rootPane: addTabToPane(layout.rootPane, firstTabGroup.id, tab)
              }
            }
            // Also update activePaneId to this group
            newState.activePaneId = firstTabGroup.id
          }
        }
      } else {
        console.log('[addTab] No project layout found, creating flat tab only')
      }
      
      console.log('[addTab] Tab added successfully')
      return newState
    }),

  removeTab: (id) =>
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id)
      const wasActive = s.activeTabId === id
      const projectTabs = newTabs.filter((t) => t.projectId === s.activeProjectId)
      
      const newState: Partial<AppState> = {
        tabs: newTabs,
        activeTabId: wasActive ? (projectTabs[projectTabs.length - 1]?.id ?? null) : s.activeTabId,
      }
      
      // If we have a layout for this project, remove the tab from the layout tree
      if (s.activeProjectId && s.projectLayouts[s.activeProjectId]) {
        const layout = s.projectLayouts[s.activeProjectId]
        const newRootPane = removeTabFromPane(layout.rootPane, id)
        
        // If the entire layout became empty, create a default empty TabGroup
        if (newRootPane === null) {
          newState.projectLayouts = {
            ...s.projectLayouts,
            [s.activeProjectId]: {
              rootPane: createTabGroup(),
              activePaneId: null
            }
          }
          newState.activePaneId = null
        } else {
          newState.projectLayouts = {
            ...s.projectLayouts,
            [s.activeProjectId]: {
              ...layout,
              rootPane: newRootPane
            }
          }
        }
      }
      
      return newState
    }),

  /**
   * Set the active tab globally and in the layout tree (if in split layout mode)
   * This ensures the tab appears selected in both the global state and the specific TabGroup
   */
  setActiveTab: (tabId: string | null) => {
    set((state) => {
      // If no active project or no layout, just update the global activeTabId
      if (!state.activeProjectId || !state.projectLayouts[state.activeProjectId]) {
        return { activeTabId: tabId }
      }

      // Find which TabGroup contains this tab
      const layout = state.projectLayouts[state.activeProjectId]
      if (!layout) return { activeTabId: tabId }

      const tabGroup = tabId ? findTabGroupContainingTab(layout.rootPane, tabId) : null
      if (!tabGroup) {
        // Tab not found in any TabGroup, just update global state
        return { activeTabId: tabId }
      }

      // Update the activeTabId in the specific TabGroup within the tree
      const newRootPane = setActiveTabInTree(layout.rootPane, tabGroup.id, tabId)

      return {
        activeTabId: tabId,
        activePaneId: tabGroup.id,
        projectLayouts: {
          ...state.projectLayouts,
          [state.activeProjectId]: {
            ...layout,
            rootPane: newRootPane
          }
        }
      }
    })
  },

  moveTabInActiveProject: (sourceTabId, targetTabId) =>
    set((s) => {
      const projectId = s.activeProjectId
      if (!projectId || sourceTabId === targetTabId) return s

      const projectTabs = s.tabs.filter((t) => t.projectId === projectId)
      const sourceIndex = projectTabs.findIndex((t) => t.id === sourceTabId)
      const targetIndex = projectTabs.findIndex((t) => t.id === targetTabId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return s

      const reordered = [...projectTabs]
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      let cursor = 0
      return {
        tabs: s.tabs.map((tab) => (tab.projectId === projectId ? reordered[cursor++] : tab)),
      }
    }),

  setTerminalTitleFromCommand: (ptyId, command) =>
    set((s) => {
      const nextTitle = titleFromTerminalCommand(command)
      let changed = false
      const tabs = s.tabs.map((tab) => {
        if (tab.type !== 'terminal' || tab.ptyId !== ptyId) return tab
        if (tab.title === nextTitle) return tab
        changed = true
        return { ...tab, title: nextTitle }
      })

      return changed ? { tabs } : s
    }),

  setRightPanelMode: (mode) =>
    set((s) => {
      const projectId = s.activeProjectId
      if (!projectId) return s
      return {
        rightPanelMode: { ...s.rightPanelMode, [projectId]: mode },
      }
    }),

  toggleRightPanel: () =>
    set((s) => {
      const projectId = s.activeProjectId
      if (!projectId) return s
      const current = s.rightPanelOpen[projectId] ?? true
      return {
        rightPanelOpen: { ...s.rightPanelOpen, [projectId]: !current },
      }
    }),

  setRightPanelSize: (size: number) =>
    set((s) => {
      const projectId = s.activeProjectId
      if (!projectId) return s
      return {
        rightPanelSize: { ...s.rightPanelSize, [projectId]: size },
      }
    }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  nextTab: () => {
    const s = get()
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    if (projectTabs.length <= 1) return
    const idx = projectTabs.findIndex((t) => t.id === s.activeTabId)
    const next = projectTabs[(idx + 1) % projectTabs.length]
    set({ activeTabId: next.id })
  },

  prevTab: () => {
    const s = get()
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    if (projectTabs.length <= 1) return
    const idx = projectTabs.findIndex((t) => t.id === s.activeTabId)
    const prev = projectTabs[(idx - 1 + projectTabs.length) % projectTabs.length]
    set({ activeTabId: prev.id })
  },

  createTerminalForActiveProject: async () => {
    const s = get()
    if (!s.activeProjectId) return
    const project = s.projects.find((p) => p.id === s.activeProjectId)
    if (!project) return

    const shell = s.settings.defaultShell || undefined
    const ptyId = await window.api.pty.create(project.repoPath, shell, { AGENT_ORCH_PROJECT_ID: project.id })

    // Determine terminal title based on shell type
    let title = 'Terminal'
    if (shell) {
      if (shell.includes('powershell') || shell.includes('pwsh')) {
        title = 'PowerShell'
      } else if (shell.includes('bash')) {
        title = 'Bash'
      } else if (shell.includes('zsh')) {
        title = 'Zsh'
      } else if (shell.includes('fish')) {
        title = 'Fish'
      } else if (shell.includes('wsl') || shell.includes('ubuntu')) {
        title = 'Ubuntu'
      }
    }

    get().addTab({
      id: crypto.randomUUID(),
      projectId: s.activeProjectId,
      type: 'terminal',
      title: title,
      ptyId,
    })
    const startupCmd = s.settings.terminalStartupCommand
    if (startupCmd) {
      executeTerminalStartupCommand(ptyId, startupCmd)
    }
  },

  closeActiveTab: () => {
    const s = get()
    if (!s.activeTabId) return
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    if (tab.type === 'file' && tab.unsaved && s.settings.confirmOnClose) {
      if (!window.confirm('This file has unsaved changes. Close anyway?')) return
    }
    if (tab.type === 'terminal') {
      window.api.pty.destroy(tab.ptyId)
    }
    get().removeTab(tab.id)
  },

  setTabUnsaved: (tabId, unsaved) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && t.type === 'file' ? { ...t, unsaved } : t
      ),
    })),

  notifyTabSaved: (tabId) => {
    set({ lastSavedTabId: tabId })
    setTimeout(() => {
      if (get().lastSavedTabId === tabId) set({ lastSavedTabId: null })
    }, 1200)
  },

  openFileTab: (filePath) => {
    const s = get()
    if (!s.activeProjectId) return
    const existing = s.tabs.find(
      (t) => t.projectId === s.activeProjectId && t.type === 'file' && t.filePath === filePath
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    get().addTab({
      id: crypto.randomUUID(),
      projectId: s.activeProjectId,
      type: 'file',
      filePath,
    })
  },

  switchToTabByIndex: (index) => {
    const s = get()
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    if (index >= 0 && index < projectTabs.length) {
      set({ activeTabId: projectTabs[index].id })
    }
  },

  closeAllProjectTabs: () => {
    const s = get()
    if (!s.activeProjectId) return
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    const hasUnsaved = projectTabs.some((t) => t.type === 'file' && t.unsaved)
    if (hasUnsaved && !window.confirm('Close all tabs? Some have unsaved changes.')) return
    projectTabs.forEach((t) => {
      if (t.type === 'terminal') window.api.pty.destroy(t.ptyId)
    })
    const projectId = s.activeProjectId
    set((state) => ({
      tabs: state.tabs.filter((t) => t.projectId !== projectId),
      activeTabId: null,
    }))
  },

  focusOrCreateTerminal: async () => {
    const s = get()
    if (!s.activeProjectId) return
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    const termTab = projectTabs.find((t) => t.type === 'terminal')
    if (termTab) {
      set({ activeTabId: termTab.id })
    } else {
      await get().createTerminalForActiveProject()
    }
  },

  updateProject: (id, partial) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    })),

  deleteProject: async (projectId) => {
    const s = get()
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return

    const projectTabs = s.tabs.filter((t) => t.projectId === projectId)
    projectTabs.forEach((t) => {
      if (t.type === 'terminal') window.api.pty.destroy(t.ptyId)
    })

    get().removeProject(projectId)
  },

  checkoutBranch: async (projectId, branch) => {
    const s = get()
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return

    try {
      await window.api.git.checkoutBranch(project.repoPath, branch)
      set((s) => ({
        projects: s.projects.map((p) => (p.id === projectId ? { ...p, branch } : p)),
      }))
      get().addToast({ id: crypto.randomUUID(), message: `Switched to branch: ${branch}`, type: 'info' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to checkout branch'
      get().addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
    }
  },

  createBranch: async (projectId, branch, baseBranch) => {
    const s = get()
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return

    try {
      await window.api.git.createBranch(project.repoPath, branch, baseBranch)
      set((s) => ({
        projects: s.projects.map((p) => (p.id === projectId ? { ...p, branch } : p)),
      }))
      get().addToast({ id: crypto.randomUUID(), message: `Created branch: ${branch}`, type: 'info' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create branch'
      get().addToast({ id: crypto.randomUUID(), message: msg, type: 'error' })
    }
  },

  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

  showConfirmDialog: (dialog) => set({ confirmDialog: dialog }),
  dismissConfirmDialog: () => set({ confirmDialog: null }),

  addToast: (toast) =>
    set((s) => ({ toasts: [...s.toasts, toast] })),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

   toggleQuickOpen: () => set((s) => ({ quickOpenVisible: !s.quickOpenVisible })),
   closeQuickOpen: () => set({ quickOpenVisible: false }),
   
   resetUILayout: () => set((s) => ({
     sidebarCollapsed: false,
     rightPanelMode: {},
     rightPanelOpen: {},
     rightPanelSize: {},
   })),

  markProjectUnread: (projectId) =>
    set((s) => {
      if (s.unreadProjectIds.has(projectId)) return s
      const newUnread = new Set(s.unreadProjectIds)
      newUnread.add(projectId)
      return { unreadProjectIds: newUnread }
    }),

  clearProjectUnread: (projectId) =>
    set((s) => {
      if (!s.unreadProjectIds.has(projectId)) return s
      const newUnread = new Set(s.unreadProjectIds)
      newUnread.delete(projectId)
      return { unreadProjectIds: newUnread }
    }),

  setPrStatuses: (projectId, statuses) =>
    set((s) => {
      const newMap = new Map(s.prStatusMap)
      for (const [branch, info] of Object.entries(statuses)) {
        newMap.set(`${projectId}:${branch}`, info)
      }
      return { prStatusMap: newMap }
    }),

  setGhAvailability: (projectId, available) =>
    set((s) => {
      const newMap = new Map(s.ghAvailability)
      newMap.set(projectId, available)
      return { ghAvailability: newMap }
    }),

  openDiffTab: (projectId) => {
    console.log('[openDiffTab] Called for project:', projectId)
    const s = get()
    const existing = s.tabs.find(
      (t) => t.projectId === projectId && t.type === 'diff'
    )
    if (existing) {
      console.log('[openDiffTab] Found existing diff tab, switching to it:', existing.id)
      
      // REPAIR: Ensure the existing tab is in the projectLayouts tree
      // (handles corrupted state from before the fix)
      const layout = s.projectLayouts[projectId]
      if (layout) {
        const tabsInTree = new Set<string>()
        const collectTabIds = (pane: Pane) => {
          if (pane.type === 'tabGroup') {
            pane.tabs.forEach((t) => tabsInTree.add(t.id))
          } else if (pane.type === 'split') {
            pane.children.forEach(collectTabIds)
          }
        }
        collectTabIds(layout.rootPane)
        
        if (!tabsInTree.has(existing.id)) {
          console.log('[openDiffTab] Existing diff tab not in projectLayouts tree, repairing...')
          const allTabGroups = collectAllTabGroups(layout.rootPane)
          if (allTabGroups.length > 0) {
            const newRootPane = addTabToPane(layout.rootPane, allTabGroups[0].id, existing)
            set({
              projectLayouts: {
                ...s.projectLayouts,
                [projectId]: {
                  ...layout,
                  rootPane: newRootPane
                }
              },
              activeTabId: existing.id,
              activePaneId: allTabGroups[0].id
            })
            return
          }
        }
      }
      
      set({ activeTabId: existing.id })
      return
    }
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) {
      console.log('[openDiffTab] No project found, aborting')
      return
    }
    console.log('[openDiffTab] Creating new diff tab for project:', projectId, 'repoPath:', project.repoPath)
    get().addTab({
      id: crypto.randomUUID(),
      projectId,
      type: 'diff',
      repoPath: project.repoPath,
    })
    console.log('[openDiffTab] addTab called, new diff tab should be created')
  },

  hydrateState: (data) => {
    console.log('[hydrateState] Starting with data keys:', Object.keys(data))
    const projects = (data.projects ?? []).map((project) => ({
      ...project,
      prLinkProvider: project.prLinkProvider ?? DEFAULT_PR_LINK_PROVIDER,
    }))
    console.log('[hydrateState] Projects after migration:', projects.length)
    const saved = data.activeProjectId
    console.log('[hydrateState] Saved activeProjectId:', saved)
    const settings = data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : { ...DEFAULT_SETTINGS }
    console.log('[hydrateState] Settings restoreProject:', settings.restoreProject, 'restoreWorkspace:', (data.settings as any)?.restoreWorkspace)
    const shouldRestore = settings.restoreProject ?? (data.settings as any)?.restoreWorkspace ?? true
    console.log('[hydrateState] shouldRestore:', shouldRestore)
    const activeProjectId = shouldRestore
      ? ((saved && projects.some((p) => p.id === saved) ? saved : projects[0]?.id) ?? null)
      : null
    console.log('[hydrateState] Final activeProjectId:', activeProjectId)
    const allTabs = data.tabs ?? []
    const projectIds = new Set(projects.map((p) => p.id))
    
    /**
     * Filter tabs to only include valid ones with required fields.
     * 
     * BUG FIX: Handle corrupted state where diff tabs may be missing repoPath
     * due to previous version of code. Diff tabs now require repoPath, but
     * old persisted state may have diff tabs without it. We filter these out
     * to prevent crashes when the DiffViewer tries to load with empty repoPath.
     */
    const validTabs = allTabs.filter((t) => {
      // Basic validation: must have projectId that exists
      if (!t.projectId || !projectIds.has(t.projectId)) return false
      
      // Diff tabs must have a repoPath (handles corrupted state from old versions)
      if (t.type === 'diff' && !t.repoPath) {
        console.warn(`[hydrateState] Filtering out corrupted diff tab ${t.id} without repoPath`)
        return false
      }
      
      return true
    })
    console.log('[hydrateState] Tabs count:', allTabs.length, 'valid:', validTabs.length)
    const savedActiveTabId = data.activeTabId ?? null
    const activeTabId = savedActiveTabId && validTabs.some((t) => t.id === savedActiveTabId)
      ? savedActiveTabId
      : (validTabs.find((t) => t.projectId === activeProjectId)?.id ?? null)
    
    /**
     * Layout Migration & Repair:
     * 1. If projectLayouts doesn't exist, create from flat tabs (migration)
     * 2. Repair corrupted state: ensure all tabs in flat array are also in projectLayouts tree
     *    This fixes the bug where tabs existed in state but weren't visible in UI
     */
    let projectLayouts = data.projectLayouts ?? {}
    if (Object.keys(projectLayouts).length === 0 && validTabs.length > 0) {
      console.log('[hydrateState] Migrating from flat tabs to project layouts...')
      for (const project of projects) {
        const projectTabs = validTabs.filter((t) => t.projectId === project.id)
        if (projectTabs.length > 0) {
          const activeTab = projectTabs.find((t) => t.id === activeTabId) || projectTabs[0]
          projectLayouts[project.id] = {
            rootPane: createTabGroup(projectTabs, activeTab.id),
            activePaneId: null
          }
        }
      }
      console.log('[hydrateState] Layout migration complete:', Object.keys(projectLayouts).length, 'projects')
    } else if (validTabs.length > 0) {
      // REPAIR: Ensure all tabs are in the projectLayouts tree
      console.log('[hydrateState] Checking for orphaned tabs not in projectLayouts...')
      for (const project of projects) {
        const layout = projectLayouts[project.id]
        if (!layout) continue
        
        const projectTabs = validTabs.filter((t) => t.projectId === project.id)
        const tabsInTree = new Set<string>()
        
        // Collect all tab IDs currently in the tree
        const collectTabIds = (pane: Pane) => {
          if (pane.type === 'tabGroup') {
            pane.tabs.forEach((t) => tabsInTree.add(t.id))
          } else if (pane.type === 'split') {
            pane.children.forEach(collectTabIds)
          }
        }
        collectTabIds(layout.rootPane)
        
        // Find tabs not in tree
        const orphanedTabs = projectTabs.filter((t) => !tabsInTree.has(t.id))
        if (orphanedTabs.length > 0) {
          console.log(`[hydrateState] Found ${orphanedTabs.length} orphaned tabs for project ${project.id}, repairing...`)
          // Add orphaned tabs to the first TabGroup
          let newRootPane = layout.rootPane
          for (const tab of orphanedTabs) {
            const allTabGroups = collectAllTabGroups(newRootPane)
            if (allTabGroups.length > 0) {
              newRootPane = addTabToPane(newRootPane, allTabGroups[0].id, tab)
            }
          }
          projectLayouts[project.id] = {
            ...layout,
            rootPane: newRootPane
          }
        }
      }
    }
    
    set({
      projects,
      tabs: validTabs,
      activeProjectId,
      activeTabId,
      lastActiveTabByProject: data.lastActiveTabByProject ?? {},
      settings,
      rightPanelMode: data.rightPanelMode ?? {},
      rightPanelOpen: data.rightPanelOpen ?? {},
      rightPanelSize: data.rightPanelSize ?? {},
      projectLayouts,
      activePaneId: null,
    })
    console.log('[hydrateState] State set complete')
  },

  activeProjectTabs: () => {
    const s = get()
    return s.tabs.filter((t) => t.projectId === s.activeProjectId)
  },

  activeProject: () => {
    const s = get()
    return s.projects.find((p) => p.id === s.activeProjectId)
  },

  /**
   * Splits the current active tab's pane into two panes
   * The active tab stays in the original pane, and a new pane is created with a new tab
   * @param direction 'vertical' for side-by-side, 'horizontal' for top-bottom
   * @param tabId Optional tab ID (defaults to activeTabId from store)
   */
  splitCurrentTab: (direction: SplitDirection, tabId?: string) => {
    const s = get()
    const targetTabId = tabId || s.activeTabId
    
    if (!targetTabId || !s.activeProjectId) {
      console.log('[splitCurrentTab] No target tab or project')
      return
    }
    
    let layout = s.projectLayouts[s.activeProjectId]
    
    // BUG FIX: Initialize layout if it doesn't exist (e.g., when using global TabBar)
    // This allows split to work even in legacy/non-split mode
    if (!layout) {
      console.log('[splitCurrentTab] No layout for project, initializing from tabs...')
      const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
      if (projectTabs.length === 0) {
        console.log('[splitCurrentTab] No tabs to create layout from')
        return
      }
      const activeTab = projectTabs.find((t) => t.id === targetTabId) || projectTabs[0]
      layout = {
        rootPane: createTabGroup(projectTabs, activeTab.id),
        activePaneId: null
      }
      console.log('[splitCurrentTab] Layout initialized with', projectTabs.length, 'tabs')
    }
    
    // Find the TabGroup containing the target tab
    const tabGroup = findTabGroupContainingTab(layout.rootPane, targetTabId)
    if (!tabGroup) {
      console.log('[splitCurrentTab] TabGroup not found for tab', targetTabId)
      return
    }
    
    // Create a new empty TabGroup for the split
    const newTabGroup = createTabGroup()
    
    // Create a Split with original group and new empty group
    const split: Pane = {
      id: `split-${crypto.randomUUID()}`,
      type: 'split',
      direction,
      children: [tabGroup, newTabGroup] as [Pane, Pane],
      splitRatio: 0.5
    }
    
    // Helper: Replace the TabGroup with the Split in the tree
    function replacePaneInTree(root: Pane, targetId: string, replacement: Pane): Pane {
      if (root.id === targetId) {
        return replacement
      }
      if (root.type === 'split') {
        const newRoot: Pane = { 
          ...root, 
          children: [
            replacePaneInTree(root.children[0], targetId, replacement),
            replacePaneInTree(root.children[1], targetId, replacement)
          ] as [Pane, Pane]
        }
        return newRoot
      }
      return root
    }
    
    // Replace the old TabGroup with the new Split
    const newRootPane = replacePaneInTree(layout.rootPane, tabGroup.id, split)
    
    // Create a new terminal for the new pane
    const project = s.projects.find(p => p.id === s.activeProjectId)
    if (project) {
      // Create the terminal asynchronously
      const shell = s.settings.defaultShell || undefined
      
      // Determine terminal title based on shell type
      let title = 'Terminal'
      if (shell) {
        if (shell.includes('powershell') || shell.includes('pwsh')) {
          title = 'PowerShell'
        } else if (shell.includes('bash')) {
          title = 'Bash'
        } else if (shell.includes('zsh')) {
          title = 'Zsh'
        } else if (shell.includes('fish')) {
          title = 'Fish'
        } else if (shell.includes('wsl') || shell.includes('ubuntu')) {
          title = 'Ubuntu'
        }
      }
      
      window.api.pty.create(project.repoPath, shell, { AGENT_ORCH_PROJECT_ID: project.id })
        .then(ptyId => {
          const newTab: Tab = {
            id: crypto.randomUUID(),
            projectId: s.activeProjectId!,
            type: 'terminal',
            title: title,
            ptyId
          }
          
          // Add the new tab to both the flat array and the layout
          set((state) => {
            const updatedLayout = state.projectLayouts[s.activeProjectId!]
            const newLayoutRoot = addTabToPane(updatedLayout.rootPane, newTabGroup.id, newTab)
            
            return {
              tabs: [...state.tabs, newTab],
              projectLayouts: {
                ...state.projectLayouts,
                [s.activeProjectId!]: {
                  ...updatedLayout,
                  rootPane: newLayoutRoot,
                  activePaneId: newTabGroup.id
                }
              },
              activePaneId: newTabGroup.id,
              activeTabId: newTab.id
            }
          })
          
          // Execute startup command if configured
          const startupCmd = s.settings.terminalStartupCommand
          if (startupCmd) {
            setTimeout(() => {
              window.api.pty.write(ptyId, startupCmd + '\r\n')
            }, 500)
          }
        })
        .catch(err => {
          console.error('[splitCurrentTab] Failed to create terminal:', err)
        })
    }
    
    // Update the layout immediately with the split structure
    set((state) => ({
      projectLayouts: {
        ...state.projectLayouts,
        [s.activeProjectId!]: {
          rootPane: newRootPane,
          activePaneId: newTabGroup.id
        }
      },
      activePaneId: newTabGroup.id
    }))
    
    console.log(`[splitCurrentTab] Success! Created split with direction ${direction}. New pane: ${newTabGroup.id}`)
  },

  /**
   * Sets the currently active pane ID
   * Called when user clicks into a TabGroup to track focus
   */
  setActivePaneId: (paneId: string | null) => {
    set({ activePaneId: paneId })
  },

  /**
   * Updates the layout for a specific project
   * Used by SplitPanel components when layout changes (e.g., resizing)
   */
  updateProjectLayout: (projectId: string, layout: ProjectLayout) => {
    set((state) => ({
      projectLayouts: {
        ...state.projectLayouts,
        [projectId]: layout
      }
    }))
  },

  /**
   * Finds the TabGroup pane ID that contains a specific tab
   * Used to determine which pane is active based on active tab
   */
  getTabPaneId: (tabId: string) => {
    const s = get()
    if (!s.activeProjectId) return null
    
    const layout = s.projectLayouts[s.activeProjectId]
    if (!layout) return null
    
    const tabGroup = findTabGroupContainingTab(layout.rootPane, tabId)
    return tabGroup?.id || null
  },
}))

// State persistence

function getPersistedSlice(state: AppState): PersistedState {
  return {
    projects: state.projects,
    tabs: state.tabs,
    activeProjectId: state.activeProjectId,
    activeTabId: state.activeTabId,
    lastActiveTabByProject: state.lastActiveTabByProject,
    settings: state.settings,
    rightPanelMode: state.rightPanelMode,
    rightPanelOpen: state.rightPanelOpen,
    rightPanelSize: state.rightPanelSize,
    projectLayouts: state.projectLayouts,
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(state: AppState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.api.state.save(getPersistedSlice(state))
  }, 500)
}

useAppStore.subscribe((state, prevState) => {
  if (
    state.projects !== prevState.projects ||
    state.tabs !== prevState.tabs ||
    state.activeTabId !== prevState.activeTabId ||
    state.activeProjectId !== prevState.activeProjectId ||
    state.settings !== prevState.settings ||
    state.rightPanelMode !== prevState.rightPanelMode ||
    state.rightPanelOpen !== prevState.rightPanelOpen ||
    state.rightPanelSize !== prevState.rightPanelSize ||
    state.projectLayouts !== prevState.projectLayouts
  ) {
    debouncedSave(state)
  }
})

window.addEventListener('beforeunload', () => {
  if (saveTimer) clearTimeout(saveTimer)
  window.api.state.saveSync(getPersistedSlice(useAppStore.getState()))
})

export async function hydrateFromDisk(): Promise<void> {
  console.log('[Hydrate] Starting hydration from disk...')
  let livePtyIds: Set<string> | null = null
  try {
    console.log('[Hydrate] Listing live PTYs...')
    livePtyIds = new Set(await window.api.pty.list())
    console.log('[Hydrate] Live PTYs:', Array.from(livePtyIds))
  } catch (err) {
    console.error('[Hydrate] Failed to list live PTYs:', err)
  }

  try {
    console.log('[Hydrate] Loading state from disk...')
    const data = await window.api.state.load()
    console.log('[Hydrate] State loaded:', data ? 'yes' : 'no', data ? 'with keys: ' + Object.keys(data).join(', ') : '')
    if (data) {
      console.log('[Hydrate] Calling hydrateState...')
      useAppStore.getState().hydrateState(data)
      console.log('[Hydrate] hydrateState complete')
    }
  } catch (err) {
    console.error('[Hydrate] Failed to load persisted state:', err)
  }

  try {
    if (!livePtyIds) {
      livePtyIds = new Set(await window.api.pty.list())
    }
    const resolvedPtyIds = livePtyIds
    const store = useAppStore.getState()
    const tabs = store.tabs

    const deadTabs = tabs.filter(
      (t): t is Extract<Tab, { type: 'terminal' }> =>
        t.type === 'terminal' && !resolvedPtyIds.has(t.ptyId)
    )
    if (deadTabs.length > 0) {
      const shell = store.settings.defaultShell || undefined
      const updatedTabs = [...tabs]
      for (const dead of deadTabs) {
        const project = store.projects.find((p) => p.id === dead.projectId)
        if (!project) continue
        try {
          const newPtyId = await window.api.pty.create(project.repoPath, shell, { AGENT_ORCH_PROJECT_ID: project.id })
          const idx = updatedTabs.findIndex((t) => t.id === dead.id)
          if (idx !== -1) updatedTabs[idx] = { ...dead, ptyId: newPtyId }
          const startupCmd = store.settings.terminalStartupCommand
          if (startupCmd) {
            executeTerminalStartupCommand(newPtyId, startupCmd)
          }
        } catch {
          const idx = updatedTabs.findIndex((t) => t.id === dead.id)
          if (idx !== -1) updatedTabs.splice(idx, 1)
        }
      }
      const finalTabs = updatedTabs.filter(
        (t) => store.projects.some((p) => p.id === t.projectId)
      )
      const currentActiveTab = finalTabs.find((t) => t.id === store.activeTabId)
      const validActiveTabId = currentActiveTab && currentActiveTab.projectId
        ? store.activeTabId
        : (finalTabs.find((t) => t.projectId === store.activeProjectId)?.id ?? null)
      useAppStore.setState({ tabs: finalTabs, activeTabId: validActiveTabId })
    }
  } catch (err) {
    console.error('Failed to reconcile PTY tabs:', err)
  }
}
