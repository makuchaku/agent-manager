import { Allotment } from 'allotment'
import type { Pane, Split, TabGroup } from '../../store/types'
import { TabGroup as TabGroupComponent } from './TabGroup'
import styles from './SplitPanel.module.css'

interface SplitPanelProps {
  pane: Pane
  projectId: string
  isRoot?: boolean
  depth?: number
}

const MAX_DEPTH = 20 // Prevent infinite recursion from circular references

/**
 * SplitPanel — Recursive component for rendering the pane tree
 * 
 * Renders either a TabGroup (leaf) or a Split resizer (branch).
 * Uses the 'allotment' library for smooth resizable split panes.
 * 
 * Architecture:
 * - Pane can be a TabGroup (contains tabs) or Split (contains 2 child panes)
 * - Split direction: 'vertical' = side-by-side, 'horizontal' = top-bottom
 * - Split ratio: 0.0-1.0 representing first child's percentage
 * 
 * @example
 * <SplitPanel pane={rootPane} projectId="proj-123" isRoot={true} />
 */
export function SplitPanel({ pane, projectId, isRoot = false, depth = 0 }: SplitPanelProps) {
  // Safety check: prevent infinite recursion
  if (depth > MAX_DEPTH) {
    console.error('[SplitPanel] Max depth exceeded, possible circular reference')
    return (
      <div className={styles.error}>
        Error: Too many nested splits
      </div>
    )
  }

  // Safety check: invalid pane
  if (!pane) {
    console.error('[SplitPanel] Received null/undefined pane')
    return (
      <div className={styles.error}>
        Error: Invalid pane
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // LEAF NODE: TabGroup — renders actual tabs
  // ═══════════════════════════════════════════════════════
  if (pane.type === 'tabGroup') {
    const tabGroup = pane as TabGroup
    return (
      <TabGroupComponent
        paneId={tabGroup.id}
        tabs={tabGroup.tabs}
        activeTabId={tabGroup.activeTabId}
        projectId={projectId}
      />
    )
  }

  // ═══════════════════════════════════════════════════════
  // BRANCH NODE: Split — renders two panes with resize handle
  // ═══════════════════════════════════════════════════════
  const split = pane as Split
  const [firstChild, secondChild] = split.children

  // Safety checks for children
  if (!firstChild || !secondChild) {
    console.error('[SplitPanel] Split has null/undefined children', { split, firstChild, secondChild })
    return (
      <div className={styles.error}>
        Error: Invalid split configuration
      </div>
    )
  }
  
  // Convert split ratio (0-1) to pixel-based sizes for allotment
  // We use percentage values which allotment handles well
  const firstSize = Math.round(split.splitRatio * 100)
  const secondSize = 100 - firstSize

  return (
    <Allotment
      className={styles.splitContainer}
      vertical={split.direction === 'horizontal'}
      // Set initial sizes based on split ratio
      defaultSizes={[firstSize, secondSize]}
      // Minimum size for each pane (prevents collapsing entirely)
      minSize={100}
      // Snap to these sizes when close
      snap
    >
      <Allotment.Pane className={styles.pane}>
        <SplitPanel pane={firstChild} projectId={projectId} depth={depth + 1} />
      </Allotment.Pane>
      <Allotment.Pane className={styles.pane}>
        <SplitPanel pane={secondChild} projectId={projectId} depth={depth + 1} />
      </Allotment.Pane>
    </Allotment>
  )
}
