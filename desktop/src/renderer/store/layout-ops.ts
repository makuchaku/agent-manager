/**
 * Layout Operations — Tree traversal and manipulation utilities
 * 
 * Helper functions for working with the recursive Pane tree structure.
 * These are pure functions that don't depend on React or Zustand.
 */

import type { Pane, TabGroup, Split, ProjectLayout, Tab, SplitDirection } from './types'

/** Maximum allowed depth for pane tree to prevent stack overflow */
const MAX_TREE_DEPTH = 10

/**
 * Validate that a pane tree doesn't exceed maximum depth
 */
export function validateTreeDepth(root: Pane, currentDepth = 0): boolean {
  if (currentDepth > MAX_TREE_DEPTH) {
    console.warn(`[layout] Tree depth exceeds maximum ${MAX_TREE_DEPTH}`)
    return false
  }
  
  if (root.type === 'split') {
    return root.children.every(child => validateTreeDepth(child, currentDepth + 1))
  }
  
  return true
}
export function generatePaneId(): string {
  return `pane-${crypto.randomUUID()}`
}

/**
 * Create a new TabGroup with optional initial tabs
 */
export function createTabGroup(tabs: Tab[] = [], activeTabId: string | null = null): TabGroup {
  return {
    id: generatePaneId(),
    type: 'tabGroup',
    tabs: [...tabs],
    activeTabId
  }
}

/**
 * Create a new Split with two child panes
 */
export function createSplit(
  direction: SplitDirection,
  firstChild: Pane,
  secondChild: Pane,
  splitRatio: number = 0.5
): Split {
  return {
    id: generatePaneId(),
    type: 'split',
    direction,
    children: [firstChild, secondChild],
    splitRatio
  }
}

/**
 * Find a pane by ID in the tree
 * Returns the pane or null if not found
 */
export function findPaneById(root: Pane, paneId: string): Pane | null {
  if (root.id === paneId) {
    return root
  }

  if (root.type === 'split') {
    for (const child of root.children) {
      const found = findPaneById(child, paneId)
      if (found) return found
    }
  }

  return null
}

/**
 * Find the parent Split of a pane
 * Returns the parent Split and the index of the child (0 or 1), or null if root
 */
export function findParentSplit(
  root: Pane,
  targetPaneId: string,
  parent: Split | null = null,
  childIndex: number = 0
): { parent: Split; childIndex: number } | null {
  if (root.id === targetPaneId) {
    return parent ? { parent, childIndex } : null
  }

  if (root.type === 'split') {
    for (let i = 0; i < root.children.length; i++) {
      const result = findParentSplit(root.children[i], targetPaneId, root, i)
      if (result) return result
    }
  }

  return null
}

/**
 * Collect all tabs from all TabGroups in the tree
 */
export function collectAllTabs(root: Pane): Tab[] {
  const tabs: Tab[] = []

  if (root.type === 'tabGroup') {
    tabs.push(...root.tabs)
  } else if (root.type === 'split') {
    for (const child of root.children) {
      tabs.push(...collectAllTabs(child))
    }
  }

  return tabs
}

/**
 * Collect all panes (both TabGroups and Splits) in the tree
 */
export function collectAllPanes(root: Pane): Pane[] {
  const panes: Pane[] = [root]

  if (root.type === 'split') {
    for (const child of root.children) {
      panes.push(...collectAllPanes(child))
    }
  }

  return panes
}

/**
 * Collect only TabGroups (leaf nodes) from the tree
 */
export function collectAllTabGroups(root: Pane): TabGroup[] {
  const groups: TabGroup[] = []

  if (root.type === 'tabGroup') {
    groups.push(root)
  } else if (root.type === 'split') {
    for (const child of root.children) {
      groups.push(...collectAllTabGroups(child))
    }
  }

  return groups
}

/**
 * Find which TabGroup contains a specific tab
 */
export function findTabGroupContainingTab(root: Pane, tabId: string): TabGroup | null {
  if (root.type === 'tabGroup') {
    if (root.tabs.some((t) => t.id === tabId)) {
      return root
    }
    return null
  }

  if (root.type === 'split') {
    for (const child of root.children) {
      const found = findTabGroupContainingTab(child, tabId)
      if (found) return found
    }
  }

  return null
}

/**
 * Generate a unique ID for panes
 */
export function generatePaneId(): string {
  return `pane-${crypto.randomUUID()}`
}

/**
 * Check for pane ID collisions in the tree
 * Returns true if any duplicate IDs are found
 */
export function hasPaneIdCollision(root: Pane): boolean {
  const ids = new Set<string>()
  const duplicates = new Set<string>()
  
  function collectIds(pane: Pane) {
    if (ids.has(pane.id)) {
      duplicates.add(pane.id)
    } else {
      ids.add(pane.id)
    }
    
    if (pane.type === 'split') {
      pane.children.forEach(collectIds)
    }
  }
  
  collectIds(root)
  return duplicates.size > 0
}

/**
 * Check if a split has only one child (should be collapsed)
 */
export function shouldCollapseSplit(split: Split): boolean {
  // A split should be collapsed if either child is empty
  return split.children.some((child) => isPaneEmpty(child))
}

/**
 * Deep clone a pane tree
 */
export function clonePaneTree(pane: Pane): Pane {
  if (pane.type === 'tabGroup') {
    return {
      ...pane,
      tabs: [...pane.tabs]
    }
  }

  return {
    ...pane,
    children: [clonePaneTree(pane.children[0]), clonePaneTree(pane.children[1])] as [Pane, Pane]
  }
}

/**
 * Remove a pane from the tree and return the new root
 * If removing the root, returns the sibling or null
 */
export function removePaneFromTree(root: Pane, paneId: string): Pane | null {
  // If removing the root
  if (root.id === paneId) {
    return null
  }

  // Clone to avoid mutating original
  const newRoot = clonePaneTree(root)

  // Find parent of target
  const parentInfo = findParentSplit(newRoot, paneId)
  if (!parentInfo) return newRoot // Pane not found

  const { parent, childIndex } = parentInfo
  const siblingIndex = childIndex === 0 ? 1 : 0
  const sibling = parent.children[siblingIndex]

  // Replace the parent split with the sibling
  const grandParentInfo = findParentSplit(newRoot, parent.id)
  if (!grandParentInfo) {
    // Parent is root, return sibling as new root
    return sibling
  }

  // Replace in grandparent
  const { parent: grandParent, childIndex: parentIndex } = grandParentInfo
  grandParent.children[parentIndex] = sibling

  return newRoot
}

/**
 * Split a TabGroup into two, moving a specific tab to the new group
 */
export function splitTabGroup(
  tabGroup: TabGroup,
  tabIdToMove: string,
  direction: SplitDirection
): Split {
  const tabToMove = tabGroup.tabs.find((t) => t.id === tabIdToMove)
  if (!tabToMove) {
    throw new Error(`Tab ${tabIdToMove} not found in group ${tabGroup.id}`)
  }

  // Create new group with the moved tab
  const newGroup = createTabGroup([tabToMove], tabIdToMove)

  // Create group with remaining tabs
  const remainingTabs = tabGroup.tabs.filter((t) => t.id !== tabIdToMove)
  const originalGroup = createTabGroup(
    remainingTabs,
    remainingTabs.length > 0 ? remainingTabs[0].id : null
  )

  // Determine order based on direction
  const [first, second] = direction === 'vertical'
    ? [originalGroup, newGroup] // Original on left, new on right
    : [originalGroup, newGroup] // Original on top, new on bottom

  return createSplit(direction, first, second, 0.5)
}

/**
 * Move a tab from one TabGroup to another
 */
export function moveTabBetweenGroups(
  sourceGroup: TabGroup,
  targetGroup: TabGroup,
  tabId: string,
  position: 'start' | 'end' | 'after' | 'before' = 'end',
  targetTabId?: string
): void {
  const tabIndex = sourceGroup.tabs.findIndex((t) => t.id === tabId)
  if (tabIndex === -1) {
    throw new Error(`Tab ${tabId} not found in source group`)
  }

  const [tab] = sourceGroup.tabs.splice(tabIndex, 1)

  // Update source active tab
  if (sourceGroup.activeTabId === tabId) {
    sourceGroup.activeTabId = sourceGroup.tabs.length > 0 ? sourceGroup.tabs[0].id : null
  }

  // Add to target
  switch (position) {
    case 'start':
      targetGroup.tabs.unshift(tab)
      break
    case 'end':
      targetGroup.tabs.push(tab)
      break
    case 'after':
    case 'before':
      const targetIndex = targetTabId
        ? targetGroup.tabs.findIndex((t) => t.id === targetTabId)
        : -1
      if (targetIndex === -1) {
        targetGroup.tabs.push(tab)
      } else {
        const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
        targetGroup.tabs.splice(insertIndex, 0, tab)
      }
      break
  }

  // Set as active in target
  targetGroup.activeTabId = tabId
}

/**
 * Set the active tab in a specific TabGroup within the pane tree
 * 
 * This function traverses the recursive pane tree and updates the activeTabId
 * of the specified TabGroup. It returns a new root pane with the update applied,
 * maintaining immutability (does not mutate the original tree).
 * 
 * Used by the store's setActiveTab to ensure tab selection works correctly
 * in split layout mode, where each TabGroup maintains its own activeTabId.
 * 
 * @param root - The root pane of the tree
 * @param tabGroupId - The ID of the TabGroup to update
 * @param tabId - The ID of the tab to set as active (or null to clear)
 * @returns A new root pane with the updated activeTabId
 */
export function setActiveTabInTree(root: Pane, tabGroupId: string, tabId: string | null): Pane {
  // If this is the target TabGroup, update its activeTabId
  if (root.type === 'tabGroup' && root.id === tabGroupId) {
    return {
      ...root,
      activeTabId: tabId
    }
  }

  // If this is a split, recursively search children
  if (root.type === 'split') {
    const newChildren: [Pane, Pane] = [
      setActiveTabInTree(root.children[0], tabGroupId, tabId),
      setActiveTabInTree(root.children[1], tabGroupId, tabId)
    ]

    // Only create new object if a child was actually updated
    if (newChildren[0] !== root.children[0] || newChildren[1] !== root.children[1]) {
      return {
        ...root,
        children: newChildren
      }
    }
  }

  return root
}
