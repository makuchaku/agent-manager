import { create } from 'zustand'
import type { AppState, PersistedState, Tab } from './types'
import { DEFAULT_SETTINGS } from './types'
import { titleFromTerminalCommand } from './terminal-tab-title'

const DEFAULT_PR_LINK_PROVIDER = 'github' as const

function executeTerminalStartupCommand(ptyId: string, command: string) {
  if (!command.trim()) return
  setTimeout(() => {
    window.api.pty.write(ptyId, command + '\r\n')
  }, 500)
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  tabs: [],
  automations: [],
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
  automationsOpen: false,
  confirmDialog: null,
  toasts: [],
  quickOpenVisible: false,
  unreadProjectIds: new Set<string>(),
  activeAgentProjectIds: new Set<string>(),
  prStatusMap: new Map(),
  ghAvailability: new Map(),

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
      const projectAutomations = s.automations.filter((a) => a.projectId === id)
      for (const a of projectAutomations) {
        window.api.automations.delete(a.id)
      }
      const newProjects = s.projects.filter((p) => p.id !== id)
      const newTabs = s.tabs.filter((t) => t.projectId !== id)
      const newAutomations = s.automations.filter((a) => a.projectId !== id)
      const newUnread = new Set(Array.from(s.unreadProjectIds).filter((pid) => pid !== id))
      const newActiveAgent = new Set(Array.from(s.activeAgentProjectIds).filter((pid) => pid !== id))
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
        automations: newAutomations,
        unreadProjectIds: newUnread,
        activeAgentProjectIds: newActiveAgent,
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
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) =>
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id)
      const wasActive = s.activeTabId === id
      const projectTabs = newTabs.filter((t) => t.projectId === s.activeProjectId)
      return {
        tabs: newTabs,
        activeTabId: wasActive ? (projectTabs[projectTabs.length - 1]?.id ?? null) : s.activeTabId,
      }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

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
    const projectTabs = s.tabs.filter((t) => t.projectId === s.activeProjectId)
    const termCount = projectTabs.filter((t) => t.type === 'terminal').length

    get().addTab({
      id: crypto.randomUUID(),
      projectId: s.activeProjectId,
      type: 'terminal',
      title: `Terminal ${termCount + 1}`,
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

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen, automationsOpen: false })),
  toggleAutomations: () => set((s) => ({ automationsOpen: !s.automationsOpen, settingsOpen: false })),

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

  setActiveAgentProjects: (projectIds) =>
    set(() => ({ activeAgentProjectIds: new Set(projectIds) })),

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

  addAutomation: (automation) =>
    set((s) => ({ automations: [...s.automations, automation] })),

  updateAutomation: (id, partial) =>
    set((s) => ({
      automations: s.automations.map((a) => (a.id === id ? { ...a, ...partial } : a)),
    })),

  removeAutomation: (id) =>
    set((s) => ({ automations: s.automations.filter((a) => a.id !== id) })),

  openDiffTab: (projectId) => {
    const s = get()
    const existing = s.tabs.find(
      (t) => t.projectId === projectId && t.type === 'diff'
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    get().addTab({
      id: crypto.randomUUID(),
      projectId,
      type: 'diff',
    })
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
    const validTabs = allTabs.filter((t) => t.projectId && projectIds.has(t.projectId))
    console.log('[hydrateState] Tabs count:', allTabs.length, 'valid:', validTabs.length)
    const savedActiveTabId = data.activeTabId ?? null
    const activeTabId = savedActiveTabId && validTabs.some((t) => t.id === savedActiveTabId)
      ? savedActiveTabId
      : (validTabs.find((t) => t.projectId === activeProjectId)?.id ?? null)
    set({
      projects,
      tabs: validTabs,
      automations: data.automations ?? [],
      activeProjectId,
      activeTabId,
      lastActiveTabByProject: data.lastActiveTabByProject ?? {},
      settings,
      rightPanelMode: data.rightPanelMode ?? {},
      rightPanelOpen: data.rightPanelOpen ?? {},
      rightPanelSize: data.rightPanelSize ?? {},
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
}))

// State persistence

function getPersistedSlice(state: AppState): PersistedState {
  return {
    projects: state.projects,
    tabs: state.tabs,
    automations: state.automations,
    activeProjectId: state.activeProjectId,
    activeTabId: state.activeTabId,
    lastActiveTabByProject: state.lastActiveTabByProject,
    settings: state.settings,
    rightPanelMode: state.rightPanelMode,
    rightPanelOpen: state.rightPanelOpen,
    rightPanelSize: state.rightPanelSize,
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
    state.automations !== prevState.automations ||
    state.activeProjectId !== prevState.activeProjectId ||
    state.settings !== prevState.settings ||
    state.rightPanelMode !== prevState.rightPanelMode ||
    state.rightPanelOpen !== prevState.rightPanelOpen ||
    state.rightPanelSize !== prevState.rightPanelSize
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

  // Schedule all enabled automations on startup
  const state = useAppStore.getState()
  for (const automation of state.automations) {
    if (!automation.enabled) continue
    const project = state.projects.find((p) => p.id === automation.projectId)
    if (!project) continue
    window.api.automations.create({
      ...automation,
      repoPath: project.repoPath,
    })
  }

  // Listen for automation run-started events from main process
  window.api.automations.onRunStarted((data) => {
    const store = useAppStore.getState()
    const { automationId, automationName, projectId, ptyId, branch } = data
    const project = store.projects.find((p) => p.id === projectId)
    if (!project) return

    // Update project's branch
    store.updateProject(projectId, { branch: branch || project.branch })

    // Create terminal tab for the run
    store.addTab({
      id: crypto.randomUUID(),
      projectId,
      type: 'terminal',
      title: automationName,
      ptyId,
    })

    // Update automation lastRunAt
    store.updateAutomation(automationId, { lastRunAt: Date.now() })
  })
}
