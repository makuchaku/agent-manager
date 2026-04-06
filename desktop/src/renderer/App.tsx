import { useEffect, useState } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { SplitPanel } from './components/SplitLayout/SplitPanel'
import { RightPanel } from './components/RightPanel/RightPanel'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { QuickOpen } from './components/QuickOpen/QuickOpen'
import { ToastContainer } from './components/Toast/Toast'
import { useShortcuts } from './hooks/useShortcuts'
import { usePrStatusPoller } from './hooks/usePrStatusPoller'
import styles from './App.module.css'
import type { Tab } from './store/types'
import type { Project } from './store/types'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import { FileEditor } from './components/Editor/FileEditor'
import { DiffViewer } from './components/Editor/DiffEditor'

console.log('[App] Component definition loaded')

export function App() {
  console.log('[App] App component rendering...')
  useShortcuts()
  usePrStatusPoller()
  
  // Performance monitoring in development
  const [renderCount, setRenderCount] = useState(0)
  useEffect(() => {
    setRenderCount(c => c + 1)
    if (process.env.NODE_ENV === 'development' && renderCount > 1) {
      console.log(`[App] Re-render #${renderCount}`)
    }
  })

  useEffect(() => {
    if (!window.api?.ui) return
    const unsub = window.api.ui.onResetLayout(() => {
      useAppStore.getState().resetUILayout()
    })
    return unsub
  }, [])

   const allTabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const rightPanelOpenRecord = useAppStore((s) => s.rightPanelOpen)
  const rightPanelSizeRecord = useAppStore((s) => s.rightPanelSize)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const activeProjectTabs = useAppStore((s) => s.activeProjectTabs)
  const projects = useAppStore((s) => s.projects)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const quickOpenVisible = useAppStore((s) => s.quickOpenVisible)
  const setRightPanelSize = useAppStore((s) => s.setRightPanelSize)
  const projectLayouts = useAppStore((s) => s.projectLayouts)

  console.log('[App] State: projects count:', projects.length, ', activeProjectId:', activeProjectId, ', activeTabId:', activeTabId)

  const projectTabs = activeProjectTabs()
  const activeTab = projectTabs.find((t) => t.id === activeTabId)
  const project = projects.find((p) => p.id === activeProjectId)

  console.log('[App] State: projects count:', projects.length, ', activeProjectId:', activeProjectId, ', activeTabId:', activeTabId)

  // Defensive: if project is undefined (e.g., activeProjectId doesn't match any project),
  // default to hiding the right panel to prevent showing unintended content
  const rightPanelOpen = project ? rightPanelOpenRecord[project.id] ?? true : false
  const rightPanelSize = project ? rightPanelSizeRecord[project.id] ?? 320 : 320

  // Get the layout for the active project, if any
  const activeLayout = activeProjectId ? projectLayouts[activeProjectId] : null

  return (
    <div className={styles.app}>
      <div className={styles.layout}>
        {settingsOpen ? (
          <SettingsPanel />
        ) : (
          <Allotment
            onResize={(sizes) => {
              const rightPanelIndex = sidebarCollapsed ? 1 : 2
              const newRightPanelSize = sizes[rightPanelIndex]
              if (newRightPanelSize && project) {
                setRightPanelSize(newRightPanelSize)
              }
            }}
          >
            {!sidebarCollapsed && (
              <Allotment.Pane minSize={160} maxSize={400} preferredSize={220}>
                <Sidebar />
              </Allotment.Pane>
            )}

            <Allotment.Pane>
              <div className={styles.centerPanel}>
                {/*
                  TabBar is only rendered in legacy mode (non-split).
                  In split layout mode, each TabGroup renders its own tab bar
                  within the split panels, so we don't need the global TabBar.
                */}
                {!activeLayout && <TabBar />}
                <div className={styles.contentArea}>
                  {activeLayout ? (
                    /**
                     * Split Layout Mode:
                     * When projectLayouts exists for this project, use the recursive
                     * SplitPanel to render the pane tree. This enables split views.
                     */
                    <SplitPanel pane={activeLayout.rootPane} projectId={activeProjectId!} isRoot={true} />
                  ) : (
                    /**
                     * Legacy/Initial Mode:
                     * Before split is used, render the single active tab or welcome screen.
                     * This maintains backward compatibility.
                     */
                    <WelcomeOrActiveTab activeTab={activeTab} project={project} />
                  )}
                </div>
              </div>
            </Allotment.Pane>

            <Allotment.Pane
              minSize={48}
              maxSize={rightPanelOpen ? 1000 : 48}
              preferredSize={rightPanelOpen ? rightPanelSize : 48}
              snap={true}
            >
              <RightPanel />
            </Allotment.Pane>
          </Allotment>
        )}
      </div>
      {quickOpenVisible && project && (
        <QuickOpen repoPath={project.repoPath} />
      )}
      <ToastContainer />
    </div>
  )
}

/**
 * WelcomeOrActiveTab — Helper component for legacy mode rendering
 * 
 * Renders either the welcome screen or the currently active tab's content.
 * Used when projectLayouts doesn't exist yet (before user activates split mode).
 * 
 * @param activeTab - The currently active tab object, or undefined
 * @param project - The currently active project, or undefined
 */
function WelcomeOrActiveTab({ activeTab, project }: { activeTab: Tab | undefined; project: Project | undefined }) {
  if (!activeTab) {
    return (
      <div className={styles.welcome}>
        <div className={styles.welcomeLogo}>Mickey</div>
        <div className={styles.welcomeHint}>
          Add a project to get started, or press
          <span className={styles.welcomeShortcut}>⌘T</span>
          for a new terminal
        </div>
      </div>
    )
  }

  // Render based on tab type
  switch (activeTab.type) {
    case 'terminal':
      return <TerminalPanel ptyId={activeTab.ptyId} active={true} />
    
    case 'file':
      return (
        <FileEditor
          tabId={activeTab.id}
          filePath={activeTab.filePath}
          active={true}
        />
      )
    
    case 'diff':
      if (!project) return null
      return <DiffViewer repoPath={project.repoPath} active={true} />
    
    default:
      return (
        <div className={styles.welcome}>
          <span>Unknown tab type</span>
        </div>
      )
  }
}
