import { useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useAppStore } from './store/app-store'
import { Sidebar } from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import { TerminalPanel } from './components/Terminal/TerminalPanel'
import { FileEditor } from './components/Editor/FileEditor'
import { DiffViewer } from './components/Editor/DiffEditor'
import { RightPanel } from './components/RightPanel/RightPanel'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { AutomationsPanel } from './components/Automations/AutomationsPanel'
import { QuickOpen } from './components/QuickOpen/QuickOpen'
import { ToastContainer } from './components/Toast/Toast'
import { useShortcuts } from './hooks/useShortcuts'
import { usePrStatusPoller } from './hooks/usePrStatusPoller'
import styles from './App.module.css'

console.log('[App] Component definition loaded')

export function App() {
  console.log('[App] App component rendering...')
  useShortcuts()
  usePrStatusPoller()

  useEffect(() => {
    if (!window.api?.agent) return
    const unsub = window.api.agent.onNotifyProject((projectId: string) => {
      const state = useAppStore.getState()
      if (projectId !== state.activeProjectId) {
        state.markProjectUnread(projectId)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!window.api?.agent) return
    let prevActive = new Set<string>()
    const unsub = window.api.agent.onActivityUpdate((projectIds: string[]) => {
      const nextActive = new Set(projectIds)
      const state = useAppStore.getState()

      for (const projectId of prevActive) {
        if (!nextActive.has(projectId) && projectId !== state.activeProjectId && state.projects.some((p) => p.id === projectId)) {
          state.markProjectUnread(projectId)
        }
      }

      state.setActiveAgentProjects(projectIds)
      prevActive = nextActive
    })
    return unsub
  }, [])

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
  const automationsOpen = useAppStore((s) => s.automationsOpen)
  const quickOpenVisible = useAppStore((s) => s.quickOpenVisible)
  const setRightPanelSize = useAppStore((s) => s.setRightPanelSize)

  console.log('[App] State: projects count:', projects.length, ', activeProjectId:', activeProjectId, ', activeTabId:', activeTabId)

  const projectTabs = activeProjectTabs()
  const activeTab = projectTabs.find((t) => t.id === activeTabId)
  const project = projects.find((p) => p.id === activeProjectId)

  console.log('[App] projectTabs count:', projectTabs.length, ', activeTab:', activeTab ? 'yes' : 'no', ', project:', project ? project.name : 'none')

  const rightPanelOpen = project ? rightPanelOpenRecord[project.id] ?? true : true
  const rightPanelSize = project ? rightPanelSizeRecord[project.id] ?? 320 : 320

  const allTerminals = allTabs.filter((t): t is Extract<typeof t, { type: 'terminal' }> => t.type === 'terminal')

  return (
    <div className={styles.app}>
      <div className={styles.layout}>
        {settingsOpen ? (
          <SettingsPanel />
        ) : automationsOpen ? (
          <AutomationsPanel />
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
                <TabBar />
                <div className={styles.contentArea}>
                  {allTerminals.map((t) => (
                    <TerminalPanel
                      key={t.id}
                      ptyId={t.ptyId}
                      active={t.id === activeTabId}
                    />
                  ))}

                  {!activeTab ? (
                    <div className={styles.welcome}>
                      <div className={styles.welcomeLogo}>MakuLabs Manager</div>
                      <div className={styles.welcomeHint}>
                        Add a project to get started, or press
                        <span className={styles.welcomeShortcut}>⌘T</span>
                        for a new terminal
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeTab?.type === 'file' && (
                        <FileEditor
                          key={activeTab.id}
                          tabId={activeTab.id}
                          filePath={activeTab.filePath}
                          active={true}
                        />
                      )}

                      {activeTab?.type === 'diff' && project && (
                        <DiffViewer
                          key={activeTab.id}
                          repoPath={project.repoPath}
                          active={true}
                        />
                      )}
                    </>
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
