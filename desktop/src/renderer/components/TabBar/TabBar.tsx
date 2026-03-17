import { useCallback, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Tab } from '../../store/types'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './TabBar.module.css'

function getTabTitle(tab: Tab): string {
  if (tab.type === 'terminal') return tab.title
  if (tab.type === 'diff') return 'Changes'
  // Handle both Unix (/) and Windows (\) path separators
  const parts = tab.filePath.split(/[/\\]/)
  const name = parts.pop() || tab.filePath
  return name
}

export function TabBar() {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const removeTab = useAppStore((s) => s.removeTab)
  const moveTabInActiveProject = useAppStore((s) => s.moveTabInActiveProject)
  const allTabs = useAppStore((s) => s.tabs)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projects = useAppStore((s) => s.projects)
  const addTab = useAppStore((s) => s.addTab)
  const createTerminalForActiveProject = useAppStore((s) => s.createTerminalForActiveProject)
  const splitCurrentTab = useAppStore((s) => s.splitCurrentTab)
  const lastSavedTabId = useAppStore((s) => s.lastSavedTabId)
  const settings = useAppStore((s) => s.settings)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const tabs = allTabs.filter((t) => t.projectId === activeProjectId)
  
  const activeProject = projects.find(p => p.id === activeProjectId)

  /**
   * Handle splitting the current tab vertically (side-by-side)
   * Creates a new pane to the right of the current pane
   */
  const handleSplitVertical = useCallback(() => {
    if (!activeTabId) return
    splitCurrentTab('vertical')
  }, [activeTabId, splitCurrentTab])

  const handleClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation()
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return
      
      // Tab closure behavior is consistent across all tab types:
      // 1. File tabs with unsaved changes prompt for confirmation (if enabled in settings).
      // 2. Terminal tabs destroy the associated PTY process before removing from state.
      // The close button location changed to right side for VS Code-like UX; functionality unchanged.

      if (tab.type === 'file' && tab.unsaved && settings.confirmOnClose) {
        if (!window.confirm(`"${getTabTitle(tab)}" has unsaved changes. Close anyway?`)) return
      }

      if (tab.type === 'terminal') {
        window.api.pty.destroy(tab.ptyId)
      }
      removeTab(tabId)
    },
    [settings.confirmOnClose, tabs, removeTab]
  )

  const clearDragState = useCallback(() => {
    setDraggingTabId(null)
    setDragOverTabId(null)
  }, [])

  /**
   * Handle creating a new tab with specific shell (PowerShell or Ubuntu WSL)
   * BUG FIX: Added missing shell buttons functionality
   * Previously only had default terminal creation, now supports specific shells
   */
  const handleNewTabWithShell = useCallback(async (shellName: 'powershell' | 'ubuntu') => {
    if (!activeProject) {
      console.log('[TabBar] No active project for shell tab')
      return
    }
    
    // Determine shell based on selection
    let shell: string | undefined
    let title: string
    switch (shellName) {
      case 'powershell':
        shell = 'powershell.exe'
        title = 'PowerShell'
        break
      case 'ubuntu':
        // On Windows, passing undefined triggers WSL Ubuntu default
        shell = undefined
        title = 'Ubuntu'
        break
    }
    
    try {
      const ptyId = await window.api.pty.create(activeProject.repoPath, shell, { AGENT_ORCH_PROJECT_ID: activeProjectId! })
      const projectTabs = allTabs.filter((t) => t.projectId === activeProjectId)
      const termCount = projectTabs.filter((t) => t.type === 'terminal').length
      
      const newTab: Tab = {
        id: crypto.randomUUID(),
        projectId: activeProjectId!,
        type: 'terminal',
        title: title,
        ptyId,
      }
      
      addTab(newTab)
      
      // Execute startup command
      const startupCmd = settings.terminalStartupCommand
      if (startupCmd) {
        setTimeout(() => {
          window.api.pty.write(ptyId, startupCmd + '\r\n')
        }, 500)
      }
      
      console.log('[TabBar] New shell tab created:', title)
    } catch (err) {
      console.error('[TabBar] Failed to create terminal:', err)
    }
  }, [activeProject, activeProjectId, allTabs, addTab, settings.terminalStartupCommand])

  /**
   * Handle opening a file from disk
   * BUG FIX: Added missing open file button functionality
   */
  const handleOpenFile = useCallback(async () => {
    if (!activeProject) {
      console.log('[TabBar] No active project for file open')
      return
    }
    
    // Open file picker
    const filePath = await window.api.app.selectFile()
    if (!filePath) {
      console.log('[TabBar] No file selected')
      return
    }
    
    // Check if file is already open
    const existingTab = allTabs.find(
      (t) => t.projectId === activeProjectId && t.type === 'file' && t.filePath === filePath
    )
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      console.log('[TabBar] Switched to existing file tab:', filePath)
      return
    }
    
    // Create new file tab
    const newTab: Tab = {
      id: crypto.randomUUID(),
      projectId: activeProjectId!,
      type: 'file',
      filePath,
      unsaved: false,
    }
    
    addTab(newTab)
    console.log('[TabBar] Opened file:', filePath)
  }, [activeProject, activeProjectId, allTabs, addTab, setActiveTab])

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, tabId: string) => {
    setDraggingTabId(tabId)
    setDragOverTabId(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>, tabId?: string) => {
      if (!draggingTabId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!tabId || tabId === draggingTabId) {
        setDragOverTabId(null)
        return
      }
      setDragOverTabId(tabId)
    },
    [draggingTabId]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, targetTabId?: string) => {
      if (!draggingTabId) return
      e.preventDefault()
      const sourceTabId = e.dataTransfer.getData('text/plain') || draggingTabId
      if (targetTabId && sourceTabId !== targetTabId) {
        moveTabInActiveProject(sourceTabId, targetTabId)
      }
      clearDragState()
    },
    [clearDragState, draggingTabId, moveTabInActiveProject]
  )

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabList}>
        {tabs.map((tab, index) => {
          const isSaved = tab.id === lastSavedTabId
          const shortcutHint = index < 9 ? `⌘${index + 1}` : null
          return (
            <div
              key={tab.id}
              draggable
              className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''} ${draggingTabId === tab.id ? styles.dragging : ''} ${dragOverTabId === tab.id ? styles.dragOver : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={clearDragState}
            >
              {/* Tab title — takes available space, ellipses if necessary */}
              <Tooltip label={tab.type === 'file' ? tab.filePath : getTabTitle(tab)}>
                <span className={`${styles.tabTitle} ${isSaved ? styles.savedFlash : ''}`}>
                  {getTabTitle(tab)}
                </span>
              </Tooltip>
              
              {/* Keyboard shortcut hint (1-9 mapped to Cmd+1..Cmd+9) */}
              {shortcutHint && <span className={styles.shortcutHint}>{shortcutHint}</span>}
              
              {/* Close button positioned on the right side for VS Code-like UX
                  Clicking triggers tab removal and PTY destruction (for terminals).
                  Preserves existing behavior: unsaved file prompts, terminal cleanup.
                  The unsaved dot indicator remains on the left; close always on right.
              */}
              <Tooltip label="Close tab" shortcut="⌘W">
                <button
                  className={styles.closeButton}
                  onClick={(e) => handleClose(e, tab.id)}
                >
                  ✕
                </button>
              </Tooltip>
            </div>
          )
        })}
      </div>

      <Tooltip label="New terminal" shortcut="⌘T">
        <button className={styles.newTabButton} onClick={createTerminalForActiveProject}>
          +
        </button>
      </Tooltip>

      {/* BUG FIX: Added missing shell and file buttons 
          Previously only had the split button, now includes:
          - PowerShell button for Windows PowerShell terminal
          - Ubuntu (WSL) button for WSL terminal  
          - Open File button to browse and open files
          These buttons are now visible in the global TabBar for quick access
      */}
      <div className={styles.shellButtons}>
        <Tooltip label="New PowerShell">
          <button 
            className={`${styles.shellButton}`}
            onClick={() => handleNewTabWithShell('powershell')}
            title="New PowerShell"
          >
            <span className={styles.shellIcon}>PS</span>
          </button>
        </Tooltip>
        <Tooltip label="New Ubuntu (WSL)">
          <button 
            className={`${styles.shellButton}`}
            onClick={() => handleNewTabWithShell('ubuntu')}
            title="New Ubuntu (WSL)"
          >
            <span className={styles.shellIcon}>⊕</span>
          </button>
        </Tooltip>
        <Tooltip label="Open file">
          <button 
            className={styles.fileButton}
            onClick={handleOpenFile}
            title="Open file"
          >
            <span className={styles.fileIcon}>📄</span>
          </button>
        </Tooltip>
      </div>

      {/* Split buttons — right-aligned, allow splitting current tab */}
      <div className={styles.splitButtons}>
        <Tooltip label="Split right">
          <button 
            className={styles.splitButton} 
            onClick={handleSplitVertical}
            disabled={!activeTabId}
          >
            ◫
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
