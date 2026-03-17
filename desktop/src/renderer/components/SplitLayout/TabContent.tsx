import type { Tab } from '../../store/types'
import { TerminalPanel } from '../Terminal/TerminalPanel'
import { FileEditor } from '../Editor/FileEditor'
import { DiffViewer } from '../Editor/DiffEditor'
import { ImageViewer } from '../Editor/ImageViewer'
import styles from './TabContent.module.css'

// Image file extensions
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'tiff', 'tif', 'svg'
])

function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext !== undefined && IMAGE_EXTENSIONS.has(ext)
}

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

  // Render based on tab type
  switch (tab.type) {
    case 'terminal':
      return (
        <div className={styles.content}>
          <TerminalPanel ptyId={tab.ptyId} active={true} />
        </div>
      )

    case 'file':
      // Check if this is an image file and render with ImageViewer
      if (isImageFile(tab.filePath)) {
        return (
          <div className={styles.content}>
            <ImageViewer filePath={tab.filePath} />
          </div>
        )
      }
      return (
        <div className={styles.content}>
          <FileEditor
            tabId={tab.id}
            filePath={tab.filePath}
            active={true}
          />
        </div>
      )

    case 'diff':
      return (
        <div className={styles.content}>
          <DiffViewer repoPath={tab.repoPath} active={true} />
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
