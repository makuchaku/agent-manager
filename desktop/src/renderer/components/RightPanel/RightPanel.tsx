import { useAppStore } from '../../store/app-store'
import { FileTree } from './FileTree'
import { ChangedFiles } from './ChangedFiles'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './RightPanel.module.css'

export function RightPanel() {
  // Test comment to verify edit works
  const rightPanelModeRecord = useAppStore((s) => s.rightPanelMode)
  const setRightPanelMode = useAppStore((s) => s.setRightPanelMode)
  const rightPanelOpenRecord = useAppStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projects = useAppStore((s) => s.projects)

  const project = projects.find((p) => p.id === activeProjectId)

  // Derive project-specific panel state, falling back to defaults
  const rightPanelMode = project ? rightPanelModeRecord[project.id] ?? 'gemini' : 'gemini'
  const rightPanelOpen = project ? rightPanelOpenRecord[project.id] ?? true : true

  const handleToggle = (mode: 'gemini' | 'files' | 'changes') => {
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
        <Tooltip label="Gemini">
          <button
            className={`${styles.activityButton} ${rightPanelOpen && rightPanelMode === 'gemini' ? styles.active : ''}`}
            onClick={() => handleToggle('gemini')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
                fill="url(#gemini-gradient)"
              />
              <defs>
                <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4E8CFF" />
                  <stop offset="100%" stopColor="#D961FF" />
                </linearGradient>
              </defs>
            </svg>
          </button>
        </Tooltip>

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

        <Tooltip label="Changes" shortcut="⇧⌘G">
          <button
            className={`${styles.activityButton} ${rightPanelOpen && rightPanelMode === 'changes' ? styles.active : ''}`}
            onClick={() => handleToggle('changes')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="1.05" y1="12" x2="7" y2="12" />
              <line x1="17.01" y1="12" x2="22.96" y2="12" />
            </svg>
          </button>
        </Tooltip>


      </div>

      {/* Main Content Area (Always mounted to prevent webview reload) */}
      <div 
        className={styles.mainContent}
        style={{ display: rightPanelOpen ? 'flex' : 'none' }}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            {rightPanelMode === 'gemini' ? 'Gemini' : rightPanelMode === 'files' ? 'Explorer' : 'Source Control'}
          </div>
        </div>

        <div className={styles.content}>
          {/* Gemini View - Per-project webview pooling for session persistence */}
          <div style={{ display: rightPanelMode === 'gemini' ? 'flex' : 'none', flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
            {projects.map((p) => {
              const isActiveProject = project?.id === p.id
              return (
                <webview
                  key={p.id}  // Stable key per project - keeps webview mounted
                  src="https://gemini.google.com"
                  partition={`persist:gemini-${p.id}`}  // Persistent partition per project
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#1e1e1e',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    visibility: isActiveProject ? 'visible' : 'hidden',
                    opacity: isActiveProject ? 1 : 0,
                  }}
                  useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                />
              )
            })}
          </div>

            {/* Files/Changes Views */}
            {!project ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📁</span>
                <span className={styles.emptyText}>
                  Select a project to browse files
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: rightPanelMode === 'files' ? 'flex' : 'none', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {project && <FileTree repoPath={project.repoPath} isActive={rightPanelMode === 'files'} />}
                </div>
                <div style={{ display: rightPanelMode === 'changes' ? 'flex' : 'none', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {project && (
                    <ChangedFiles
                      repoPath={project.repoPath}
                      projectId={project.id}
                      isActive={rightPanelMode === 'changes'}
                    />
                  )}
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  )
}
