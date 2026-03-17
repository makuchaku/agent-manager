import { useCallback, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Tab, SplitDirection } from '../../store/types'
import { TabBar } from '../TabBar/TabBar'
import { TabSplitDropZone } from './TabSplitDropZone'
import styles from './TabGroup.module.css'

interface TabGroupProps {
  paneId: string
  tabs: Tab[]
  activeTabId: string | null
  projectId: string
}

/**
 * TabGroup — Container for tabs within a single pane
 * 
 * Renders a tab bar and manages tab activation and splitting.
 * Each TabGroup is an independent "editor group" that can be split.
 * 
 * Features:
 * - Displays tabs horizontally in a tab bar
 * - Shows split drop zones for drag-to-split functionality
 * - Handles tab activation within this pane only
 * - Manages active pane focus state
 * 
 * @example
 * <TabGroup 
 *   paneId="pane-123"
 *   tabs={[...]}
 *   activeTabId="tab-456"
 *   projectId="proj-789"
 * />
 */
export function TabGroup({ paneId, tabs, activeTabId, projectId }: TabGroupProps) {
  const setActivePane = useAppStore((s) => s.setActivePane)
  const splitPane = useAppStore((s) => s.splitPane)
  const moveTabToPane = useAppStore((s) => s.moveTabToPane)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  
  // Track if this pane is currently active (has focus)
  const isActivePane = activeProjectId === projectId // Simplified check
  
  // Drag state for split operations
  const [isDragging, setIsDragging] = useState(false)
  const [activeDropZone, setActiveDropZone] = useState<{
    direction: SplitDirection
    position: 'before' | 'after'
  } | null>(null)

  /**
   * Handle click to set this pane as active
   */
  const handlePaneClick = useCallback(() => {
    if (activeProjectId) {
      setActivePane(activeProjectId, paneId)
    }
  }, [activeProjectId, paneId, setActivePane])

  /**
   * Handle tab drag start from TabBar
   */
  const handleDragStart = useCallback(() => {
    setIsDragging(true)
  }, [])

  /**
   * Handle tab drag end
   */
  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    setActiveDropZone(null)
  }, [])

  /**
   * Handle drop zone activation during drag
   */
  const handleDropZoneActivate = useCallback((direction: SplitDirection, position: 'before' | 'after') => {
    setActiveDropZone({ direction, position })
  }, [])

  /**
   * Handle drop zone deactivation
   */
  const handleDropZoneDeactivate = useCallback(() => {
    setActiveDropZone(null)
  }, [])

  /**
   * Execute split when tab is dropped on a zone
   */
  const handleSplit = useCallback((
    draggedTabId: string, 
    sourcePaneId: string,
    direction: SplitDirection,
    position: 'before' | 'after'
  ) => {
    // If dropping in same pane, we might want to reorder or ignore
    if (sourcePaneId === paneId) {
      // For now, ignore drops on same pane
      // Could be extended to support tab reordering within pane
      return
    }

    // Execute the split
    splitPane({
      sourcePaneId,
      targetPaneId: paneId,
      direction,
      tabId: draggedTabId
    })
  }, [paneId, splitPane])

  /**
   * Handle moving a tab to this pane (center drop zone)
   */
  const handleMoveTab = useCallback((
    draggedTabId: string,
    sourcePaneId: string
  ) => {
    if (sourcePaneId === paneId) return // Same pane, ignore

    moveTabToPane({
      tabId: draggedTabId,
      sourcePaneId,
      targetPaneId: paneId,
      position: 'end' // Add to end of this pane
    })
  }, [paneId, moveTabToPane])

  return (
    <div 
      className={`${styles.tabGroup} ${isActivePane ? styles.activePane : ''}`}
      onClick={handlePaneClick}
    >
      {/* Tab Bar — scoped to this pane only */}
      <TabBar
        paneId={paneId}
        tabs={tabs}
        activeTabId={activeTabId}
        projectId={projectId}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />

      {/* Split Drop Zones — only visible during drag */}
      <TabSplitDropZone
        paneId={paneId}
        isActive={isDragging}
        activeZone={activeDropZone}
        onActivate={handleDropZoneActivate}
        onDeactivate={handleDropZoneDeactivate}
        onSplit={handleSplit}
        onMoveTab={handleMoveTab}
      />
    </div>
  )
}
