import { useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Tab, SplitDirection } from '../../store/types'
import { TabContent } from './TabContent'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './TabGroup.module.css'

interface TabGroupProps {
  paneId: string
  tabs: Tab[]
  activeTabId: string | null
  projectId: string
}

/**
 * TabGroup — Renders a tab bar and content area for a group of tabs
 * 
 * This is the leaf node in the split layout tree. Each TabGroup contains:
 * - A tab bar showing all tabs in this group with split buttons
 * - Content area showing the active tab
 * 
 * Architecture:
 * - Used by SplitPanel as the leaf node in the pane tree
 * - Manages which tab is active within this specific group
 * - Renders TabContent for the active tab
 * - Sets activePaneId when clicked so split operations know which pane to target
 * - Includes split buttons in the tab bar for creating new splits
 */
export function TabGroup({ paneId, tabs, activeTabId, projectId }: TabGroupProps) {
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setActivePaneId = useAppStore((s) => s.setActivePaneId)
  const removeTab = useAppStore((s) => s.removeTab)
  const splitCurrentTab = useAppStore((s) => s.splitCurrentTab)
  const addTab = useAppStore((s) => s.addTab)
  const createTerminalForActiveProject = useAppStore((s) => s.createTerminalForActiveProject)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  
  // Find the active tab object
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const isEmpty = tabs.length === 0

  /**
   * Handle clicking a tab to activate it
   * 
   * IMPORTANT: This updates BOTH:
   * 1. The global activeTabId (via setActiveTab) - used for global tab switching shortcuts
   * 2. The specific TabGroup's activeTabId in the projectLayouts tree (via store logic)
   * 
   * The store's setActiveTab function handles updating the layout tree structure,
   * which is necessary because each TabGroup in a split layout maintains its own
   * activeTabId. Without this, the tab would appear unselected in the UI even
   * though the global state is updated.
   * 
   * Also sets this pane as the active pane so split operations know which pane to target.
   */
  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId)
    setActivePaneId(paneId)
  }, [setActiveTab, setActivePaneId, paneId])

  /**
   * Handle creating a new tab with specific shell
   */
  const handleNewTabWithShell = useCallback(async (shellName: 'default' | 'powershell' | 'ubuntu') => {
    console.log('[TabGroup] New tab button clicked for pane:', paneId, 'with shell:', shellName)
    
    // First, set this pane as the active pane so the tab goes to the right place
    setActivePaneId(paneId)
    
    // Get current state
    const state = useAppStore.getState()
    const project = state.projects.find(p => p.id === projectId)
    if (!project) {
      console.log('[TabGroup] No project found')
      return
    }
    
    // Determine shell based on selection
    // 
    // IMPLEMENTATION:
    // - 'powershell' -> pwsh.exe (PowerShell 7+)
    // - 'ubuntu' -> wsl.exe -d Ubuntu (WSL with Ubuntu distro)
    // - Note: The 'default' case has been removed as we now always explicitly specify the shell
    // - The + button always opens Ubuntu, PowerShell icon opens PowerShell
    let shell: string | undefined
    let title: string
    // BUG FIX: Use explicit shell identifiers for each terminal type
    // 
    // REASONING:
    // - PowerShell 7+ (pwsh.exe): Modern PowerShell with better cross-platform support
    // - WSL Ubuntu (wsl.exe): Windows Subsystem for Linux with Ubuntu distro
    // - The pty-manager detects 'wsl' in the shell string to trigger WSL mode with '-d Ubuntu' args
    // - Passing undefined causes fallback to default shell (PowerShell), breaking WSL functionality
    //
    // NOTE: Shell parameter must contain 'wsl' substring for pty-manager to recognize WSL mode
    switch (shellName) {
      case 'powershell':
        shell = 'pwsh.exe'
        title = 'PowerShell'
        break
      case 'ubuntu':
      default:
        // BUG FIX: Must pass 'wsl.exe' (not undefined) to trigger WSL Ubuntu mode in pty-manager
        // The pty-manager checks if shell.includes('wsl') to determine WSL mode
        // Default case also opens Ubuntu for safety (in case of unexpected values)
        shell = 'wsl.exe'
        title = 'Ubuntu'
        break
    }
    
    try {
      const ptyId = await window.api.pty.create(project.repoPath, shell, { AGENT_ORCH_PROJECT_ID: projectId })
      const projectTabs = state.tabs.filter((t) => t.projectId === projectId)
      const termCount = projectTabs.filter((t) => t.type === 'terminal').length
      
      const newTab: Tab = {
        id: crypto.randomUUID(),
        projectId,
        type: 'terminal',
        title: title,
        ptyId,
      }
      
      // Add the tab to the flat array and to the active pane
      addTab(newTab)
      
      // Execute startup command
      const startupCmd = state.settings.terminalStartupCommand
      if (startupCmd) {
        setTimeout(() => {
          window.api.pty.write(ptyId, startupCmd + '\r\n')
        }, 500)
      }
      
      console.log('[TabGroup] New tab created in pane:', paneId)
    } catch (err) {
      console.error('[TabGroup] Failed to create terminal:', err)
    }
  }, [paneId, projectId, setActivePaneId, addTab])

  /**
   * Handle opening a file from disk
   */
  const handleOpenFile = useCallback(async () => {
    console.log('[TabGroup] Open file button clicked for pane:', paneId)
    
    // First, set this pane as the active pane
    setActivePaneId(paneId)
    
    // Get current state
    const state = useAppStore.getState()
    const project = state.projects.find(p => p.id === projectId)
    if (!project) {
      console.log('[TabGroup] No project found')
      return
    }
    
    // Open file picker
    const filePath = await window.api.app.selectFile()
    if (!filePath) {
      console.log('[TabGroup] No file selected')
      return
    }
    
    // Check if file is already open
    const existingTab = state.tabs.find(
      (t) => t.projectId === projectId && t.type === 'file' && t.filePath === filePath
    )
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      console.log('[TabGroup] Switched to existing file tab:', filePath)
      return
    }
    
    // Create new file tab
    const newTab: Tab = {
      id: crypto.randomUUID(),
      projectId,
      type: 'file',
      filePath,
      unsaved: false,
    }
    
    addTab(newTab)
    console.log('[TabGroup] Opened file:', filePath)
  }, [paneId, projectId, setActivePaneId, addTab, setActiveTab])

  /**
   * Handle creating a new tab in THIS specific pane
   * BUG FIX: Changed from 'default' to 'ubuntu' so + button opens WSL Ubuntu
   * 
   * REASONING:
   * - The + button should open the preferred working shell (WSL Ubuntu)
   * - Previously it used 'default' which relied on settings.defaultShell (PowerShell)
   * - Now it explicitly uses 'ubuntu' to open WSL Ubuntu by default
   * - PowerShell icon button is still available for explicit PowerShell access
   */
  const handleNewTab = useCallback(async () => {
    await handleNewTabWithShell('ubuntu')  // Changed from 'default' to 'ubuntu'
  }, [handleNewTabWithShell])

  /**
   * Handle closing a tab
   */
  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    console.log('[TabGroup] Close tab clicked:', tabId)
    e.stopPropagation()
    removeTab(tabId)
  }, [removeTab])

  /**
   * Handle clicking the pane background to set it as active
   */
  const handlePaneClick = useCallback(() => {
    setActivePaneId(paneId)
  }, [setActivePaneId, paneId])

  /**
   * Handle splitting the current tab
   */
  const handleSplit = useCallback((direction: SplitDirection) => {
    console.log('[TabGroup] Split clicked:', direction, 'activeTab:', activeTab?.id)
    if (!activeTab) {
      console.log('[TabGroup] No active tab to split')
      return
    }
    
    // Pass the tab ID directly to avoid async state issues
    console.log('[TabGroup] Calling splitCurrentTab with tab:', activeTab.id)
    splitCurrentTab(direction, activeTab.id)
  }, [splitCurrentTab, activeTab])

  return (
    <div 
      className={styles.tabGroup}
      onClick={handlePaneClick}
    >
      {/* Tab Bar with controls */}
      <div className={styles.tabBar}>
        {/* Tab list */}
        <div className={styles.tabList}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const title = tab.type === 'terminal' 
              ? tab.title 
              : tab.type === 'file' 
                ? tab.filePath.split(/[/\\]/).pop() || tab.filePath
                : 'Changes'
            
            return (
              <div
                key={tab.id}
                className={`${styles.tab} ${isActive ? styles.active : ''} ${tab.type === 'file' && tab.unsaved ? styles.unsaved : ''}`}
                onClick={() => handleTabClick(tab.id)}
              >
                {tab.type === 'file' && tab.unsaved && (
                  <span className={styles.unsavedDot} />
                )}
                <Tooltip label={tab.type === 'file' ? tab.filePath : title}>
                  <span className={styles.tabTitle}>{title}</span>
                </Tooltip>
                <button
                  className={styles.closeButton}
                  onClick={(e) => {
                    console.log('[TabGroup] Close button clicked for tab:', tab.id)
                    handleCloseTab(e, tab.id)
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
          {/* New Tab button - positioned next to the last tab */}
          <button 
            className={`${styles.tab} ${styles.newTabButton}`}
            onClick={(e) => { 
              console.log('[TabGroup] New tab button clicked')
              e.stopPropagation()
              handleNewTab()
            }}
            title="New Ubuntu (WSL) terminal"
          >
            <span className={styles.newTabIcon}>+</span>
          </button>
        </div>

        {/* Controls: Shell options and split button */}
        <div className={styles.controls}>
          <Tooltip label="New PowerShell">
            <button 
              className={`${styles.controlButton} ${styles.shellButton}`}
              onClick={(e) => { 
                console.log('[TabGroup] PowerShell button clicked')
                e.stopPropagation()
                handleNewTabWithShell('powershell')
              }}
              title="New PowerShell"
            >
              <span className={styles.shellIcon}>PS</span>
            </button>
          </Tooltip>
          <Tooltip label="New Ubuntu (WSL)">
            <button 
              className={`${styles.controlButton} ${styles.shellButton}`}
              onClick={(e) => { 
                console.log('[TabGroup] Ubuntu button clicked')
                e.stopPropagation()
                handleNewTabWithShell('ubuntu')
              }}
              title="New Ubuntu (WSL)"
            >
              <span className={styles.shellIcon}>⊕</span>
            </button>
          </Tooltip>
          <Tooltip label="Open file">
            <button 
              className={`${styles.controlButton} ${styles.fileButton}`}
              onClick={(e) => { 
                console.log('[TabGroup] Open file button clicked')
                e.stopPropagation()
                handleOpenFile()
              }}
              title="Open file"
            >
              <span className={styles.fileIcon}>📄</span>
            </button>
          </Tooltip>
          <div className={styles.controlDivider} />
          <Tooltip label="Split right">
            <button 
              className={styles.controlButton}
              onClick={(e) => { 
                console.log('[TabGroup] Vertical split button clicked')
                e.stopPropagation()
                handleSplit('vertical')
              }}
              title="Split right"
              disabled={!activeTab}
            >
              ◫
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content Area */}
      <div className={styles.contentArea}>
        {isEmpty ? (
          <div className={styles.empty}>
            <span>No tabs in this pane</span>
          </div>
        ) : activeTab ? (
          <TabContent tab={activeTab} projectId={projectId} />
        ) : (
          <div className={styles.empty}>
            <span>Select a tab</span>
          </div>
        )}
      </div>
    </div>
  )
}
