import { useCallback, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Tab } from '../../store/types'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './TabBar.module.css'

function getTabTitle(tab: Tab): string {
  if (tab.type === 'terminal') return tab.title
  if (tab.type === 'diff') return 'Changes'
  const name = tab.filePath.split('/').pop() || tab.filePath
  return name
}

export function TabBar() {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const removeTab = useAppStore((s) => s.removeTab)
  const moveTabInActiveWorkspace = useAppStore((s) => s.moveTabInActiveWorkspace)
  const allTabs = useAppStore((s) => s.tabs)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const createTerminalForActiveWorkspace = useAppStore((s) => s.createTerminalForActiveWorkspace)
  const lastSavedTabId = useAppStore((s) => s.lastSavedTabId)
  const settings = useAppStore((s) => s.settings)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const tabs = allTabs.filter((t) => t.workspaceId === activeWorkspaceId)

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
        moveTabInActiveWorkspace(sourceTabId, targetTabId)
      }
      clearDragState()
    },
    [clearDragState, draggingTabId, moveTabInActiveWorkspace]
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
              <span className={`${styles.tabTitle} ${isSaved ? styles.savedFlash : ''}`}>
                {getTabTitle(tab)}
              </span>
              
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
        <button className={styles.newTabButton} onClick={createTerminalForActiveWorkspace}>
          +
        </button>
      </Tooltip>

      <div className={styles.dragSpacer} />
    </div>
  )
}
