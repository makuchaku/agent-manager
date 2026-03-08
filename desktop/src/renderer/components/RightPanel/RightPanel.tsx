import { useAppStore } from '../../store/app-store'
import { FileTree } from './FileTree'
import { ChangedFiles } from './ChangedFiles'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './RightPanel.module.css'

export function RightPanel() {
  const rightPanelMode = useAppStore((s) => s.rightPanelMode)
  const setRightPanelMode = useAppStore((s) => s.setRightPanelMode)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const workspaces = useAppStore((s) => s.workspaces)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const handleToggle = (mode: 'files' | 'changes') => {
    if (rightPanelMode === mode && rightPanelOpen) {
      toggleRightPanel()
    } else {
      setRightPanelMode(mode)
      if (!rightPanelOpen) toggleRightPanel()
    }
  }

  return (
    <div className={styles.rightPanel}>
      {/* Activity Bar (Always visible on the far right) */}
      <div className={styles.activityBar}>
        <Tooltip label="Files" shortcut="⇧⌘E">
          <button
            className={`${styles.activityButton} ${rightPanelOpen && rightPanelMode === 'files' ? styles.active : ''}`}
            onClick={() => handleToggle('files')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip label="Source Control" shortcut="⇧⌘G">
          <button
            className={`${styles.activityButton} ${rightPanelOpen && rightPanelMode === 'changes' ? styles.active : ''}`}
            onClick={() => handleToggle('changes')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* Main Content Area (Hidden if panel is closed) */}
      {rightPanelOpen && (
        <div className={styles.mainContent}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              {rightPanelMode === 'files' ? 'Explorer' : 'Source Control'}
            </div>
          </div>

          <div className={styles.content}>
            {!workspace ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📁</span>
                <span className={styles.emptyText}>
                  Select a workspace to browse files
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: rightPanelMode === 'files' ? 'contents' : 'none' }}>
                  <FileTree worktreePath={workspace.worktreePath} isActive={rightPanelMode === 'files'} />
                </div>
                <div style={{ display: rightPanelMode === 'changes' ? 'contents' : 'none' }}>
                  <ChangedFiles
                    worktreePath={workspace.worktreePath}
                    workspaceId={workspace.id}
                    isActive={rightPanelMode === 'changes'}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
