import { useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Tab } from '../../store/types'
import { TerminalPanel } from '../Terminal/TerminalPanel'
import { FileEditor } from '../Editor/FileEditor'
import { DiffViewer } from '../Editor/DiffEditor'
import styles from './TabContent.module.css'

interface TabContentProps {
  tab: Tab
  projectId: string
}

/**
 * TabContent — Renders the actual content of a single tab
 * 
 * This component displays the content area for one tab:
 * - Terminal tabs: TerminalPanel with xterm.js
 * - File tabs: FileEditor with Monaco
 * - Diff tabs: DiffViewer with Monaco diffs
 * 
 * Architecture:
 * - Used within SplitPanel/TabGroup to render individual tabs
 * - Each tab maintains its own state (PTY connections, file content, etc.)
 * - No tab bar here — that's rendered at the parent level (TabGroup or App)
 * 
 * @example
 * <TabContent tab={terminalTab} projectId="proj-123" />
 */
export function TabContent({ tab, projectId }: TabContentProps) {
  // Track unsaved state for file tabs
  const setTabUnsaved = useAppStore((s) => s.setTabUnsaved)
  const notifyTabSaved = useAppStore((s) => s.notifyTabSaved)

  const handleFileChange = useCallback((unsaved: boolean) => {
    if (tab.type === 'file') {
      setTabUnsaved(tab.id, unsaved)
    }
  }, [tab, setTabUnsaved])

  const handleFileSave = useCallback(() => {
    notifyTabSaved(tab.id)
  }, [tab, notifyTabSaved])

  // Render based on tab type
  switch (tab.type) {
    case 'terminal':
      return (
        <div className={styles.content}>
          <TerminalPanel ptyId={tab.ptyId} active={true} />
        </div>
      )

    case 'file':
      return (
        <div className={styles.content}>
          <FileEditor
            tabId={tab.id}
            filePath={tab.filePath}
            active={true}
            onChange={handleFileChange}
            onSave={handleFileSave}
          />
        </div>
      )

    case 'diff':
      return (
        <div className={styles.content}>
          <DiffViewer repoPath={''} active={true} />
        </div>
      )

    default:
      return (
        <div className={styles.empty}>
          <span>Unknown tab type</span>
        </div>
      )
  }
}
