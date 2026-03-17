import { useCallback, useState, useEffect } from 'react'
import type { SplitDirection } from '../../store/types'
import styles from './TabSplitDropZone.module.css'

interface TabSplitDropZoneProps {
  paneId: string
  isActive: boolean
  activeZone: { direction: SplitDirection; position: 'before' | 'after' } | null
  onActivate: (direction: SplitDirection, position: 'before' | 'after') => void
  onDeactivate: () => void
  onSplit: (tabId: string, sourcePaneId: string, direction: SplitDirection, position: 'before' | 'after') => void
  onMoveTab: (tabId: string, sourcePaneId: string) => void
}

/**
 * TabSplitDropZone — Visual feedback and drop handling for split operations
 * 
 * Renders invisible overlay zones around the TabGroup that detect when
 * a dragged tab is near an edge. Provides visual feedback for splitting.
 * 
 * Zone Layout:
 * ┌─────────────────┐
 * │   Top Split     │ → Horizontal split, new pane above
 * ├──────┬──────────┤
 * │ Left │  Center  │ → Left: Vertical split, new pane left
 * │ Split│   Move   │   Center: Move tab to this pane
 * ├──────┴──────────┤
 * │  Bottom Split   │ → Horizontal split, new pane below
 * └─────────────────┘
 * 
 * @example
 * <TabSplitDropZone
 *   paneId="pane-123"
 *   isActive={isDragging}
 *   activeZone={activeZone}
 *   onActivate={handleActivate}
 *   onDeactivate={handleDeactivate}
 *   onSplit={handleSplit}
 *   onMoveTab={handleMoveTab}
 * />
 */
export function TabSplitDropZone({
  paneId,
  isActive,
  activeZone,
  onActivate,
  onDeactivate,
  onSplit,
  onMoveTab
}: TabSplitDropZoneProps) {
  // State to track which zones are being hovered
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)

  /**
   * Parse drag data from dataTransfer
   */
  const parseDragData = (dataTransfer: DataTransfer): { tabId: string; sourcePaneId: string } | null => {
    try {
      const data = dataTransfer.getData('text/plain')
      const parsed = JSON.parse(data)
      if (parsed.tabId && parsed.sourcePaneId) {
        return parsed
      }
    } catch {
      // Fallback: try raw text
      const raw = dataTransfer.getData('text/plain')
      if (raw) {
        return { tabId: raw, sourcePaneId: '' }
      }
    }
    return null
  }

  /**
   * Handle drag enter for a specific zone
   */
  const handleDragEnter = useCallback((zone: string, direction: SplitDirection, position: 'before' | 'after') => {
    setHoveredZone(zone)
    onActivate(direction, position)
  }, [onActivate])

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback(() => {
    setHoveredZone(null)
    onDeactivate()
  }, [onDeactivate])

  /**
   * Handle drop on a zone
   */
  const handleDrop = useCallback((
    e: React.DragEvent,
    direction: SplitDirection | null,
    position: 'before' | 'after' | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    
    const dragData = parseDragData(e.dataTransfer)
    if (!dragData) return

    if (direction && position) {
      // Split operation
      onSplit(dragData.tabId, dragData.sourcePaneId, direction, position)
    } else {
      // Move to center (this pane)
      onMoveTab(dragData.tabId, dragData.sourcePaneId)
    }

    setHoveredZone(null)
    onDeactivate()
  }, [onSplit, onMoveTab, onDeactivate])

  /**
   * Allow dropping by preventing default
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // Don't render zones if not in drag mode
  if (!isActive) return null

  return (
    <div className={styles.dropZoneOverlay}>
      {/* Top Zone — Horizontal split (pane above) */}
      <div
        className={`${styles.zone} ${styles.topZone} ${hoveredZone === 'top' ? styles.hovered : ''}`}
        onDragEnter={(e) => handleDragEnter('top', 'horizontal', 'before')}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'horizontal', 'before')}
      >
        <div className={styles.zoneIndicator}>Split Top</div>
      </div>

      {/* Middle Row — Left, Center, Right */}
      <div className={styles.middleRow}>
        {/* Left Zone — Vertical split (pane to left) */}
        <div
          className={`${styles.zone} ${styles.leftZone} ${hoveredZone === 'left' ? styles.hovered : ''}`}
          onDragEnter={(e) => handleDragEnter('left', 'vertical', 'before')}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'vertical', 'before')}
        >
          <div className={styles.zoneIndicator}>Split Left</div>
        </div>

        {/* Center Zone — Move to this pane */}
        <div
          className={`${styles.zone} ${styles.centerZone} ${hoveredZone === 'center' ? styles.hovered : ''}`}
          onDragEnter={() => setHoveredZone('center')}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, null, null)}
        >
          <div className={styles.zoneIndicator}>Move Here</div>
        </div>

        {/* Right Zone — Vertical split (pane to right) */}
        <div
          className={`${styles.zone} ${styles.rightZone} ${hoveredZone === 'right' ? styles.hovered : ''}`}
          onDragEnter={(e) => handleDragEnter('right', 'vertical', 'after')}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'vertical', 'after')}
        >
          <div className={styles.zoneIndicator}>Split Right</div>
        </div>
      </div>

      {/* Bottom Zone — Horizontal split (pane below) */}
      <div
        className={`${styles.zone} ${styles.bottomZone} ${hoveredZone === 'bottom' ? styles.hovered : ''}`}
        onDragEnter={(e) => handleDragEnter('bottom', 'horizontal', 'after')}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, 'horizontal', 'after')}
      >
        <div className={styles.zoneIndicator}>Split Bottom</div>
      </div>
    </div>
  )
}
