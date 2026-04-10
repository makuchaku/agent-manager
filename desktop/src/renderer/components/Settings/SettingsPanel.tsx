import { useEffect } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Settings } from '../../store/types'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './SettingsPanel.module.css'

const SHORTCUTS = [
  { action: 'Quick open file', keys: '⌘P', category: 'navigation' },
  { action: 'New terminal', keys: '⌘T', category: 'tabs' },
  { action: 'Close tab', keys: '⌘W', category: 'tabs' },
  { action: 'Close all tabs', keys: '⇧⌘W', category: 'tabs' },
  { action: 'Next tab', keys: '⇧⌘]', category: 'tabs' },
  { action: 'Previous tab', keys: '⇧⌘[', category: 'tabs' },
  { action: 'Tab 1–9', keys: '⌘1 – ⌘9', category: 'tabs' },
  { action: 'Next workspace', keys: '⇧⌘↓', category: 'workspace' },
  { action: 'Previous workspace', keys: '⇧⌘↑', category: 'workspace' },
  { action: 'New workspace', keys: '⌘N', category: 'workspace' },
  { action: 'Toggle sidebar', keys: '⌘B', category: 'panels' },
  { action: 'Toggle right panel', keys: '⌥⌘B', category: 'panels' },
  { action: 'Files panel', keys: '⇧⌘E', category: 'panels' },
  { action: 'Changes panel', keys: '⇧⌘G', category: 'panels' },
  { action: 'Focus terminal', keys: '⌘J', category: 'focus' },
  { action: 'Increase font size', keys: '⌘+', category: 'display' },
  { action: 'Decrease font size', keys: '⌘−', category: 'display' },
  { action: 'Reset font size', keys: '⌘0', category: 'display' },
  { action: 'Settings', keys: '⌘,', category: 'system' },
]

function ToggleRow({ label, description, value, onChange }: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.row} onClick={() => onChange(!value)}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <button
        className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={(e) => { e.stopPropagation(); onChange(!value) }}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  )
}

function TextRow({ label, description, value, onChange, placeholder }: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <input
        className={styles.textInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function NumberRow({ label, description, value, onChange, min = 8, max = 32 }: {
  label: string
  description: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <div className={styles.stepper}>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <span className={styles.stepperValue}>{value}</span>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  )
}

function SelectRow({ label, description, value, options, onChange }: {
  label: string
  description: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <select
        className={styles.selectInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const toggleSettings = useAppStore((s) => s.toggleSettings)

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    updateSettings({ [key]: value })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleSettings()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSettings])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Tooltip label="Back" shortcut="⌘,">
              <button className={styles.backBtn} onClick={toggleSettings}>‹</button>
            </Tooltip>
            <h2 className={styles.title}>Settings</h2>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.inner}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Appearance</div>

          <NumberRow
            label="Terminal font size"
            description="Font size in pixels for terminal tabs"
            value={settings.terminalFontSize}
            onChange={(v) => update('terminalFontSize', v)}
          />

          <NumberRow
            label="Editor font size"
            description="Font size in pixels for file and diff editors"
            value={settings.editorFontSize}
            onChange={(v) => update('editorFontSize', v)}
          />

          <NumberRow
            label="Editor line height"
            description="Vertical line spacing in pixels for file and diff editors (default: 20)"
            value={settings.editorLineHeight}
            min={10}
            max={40}
            onChange={(v) => update('editorLineHeight', v)}
          />

          <ToggleRow
            label="Word wrap"
            description="Wrap long lines to fit within the editor viewport"
            value={settings.wordWrap === 'on'}
            onChange={(v) => update('wordWrap', v ? 'on' : 'off')}
          />

          <SelectRow
            label="Theme"
            description="Color theme for the app chrome, file editor, and diff viewer"
            value={settings.theme}
            onChange={(v) => update('theme', v as Settings['theme'])}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'high-contrast', label: 'High Contrast' },
            ]}
          />

          <NumberRow
            label="UI font size"
            description="Font size in pixels for sidebar, panels, and dialogs"
            value={settings.uiFontSize}
            min={8}
            max={24}
            onChange={(v) => update('uiFontSize', v)}
          />

          <TextRow
            label="Terminal startup command"
            description="Command to run when a new terminal opens (leave empty to disable)"
            value={settings.terminalStartupCommand}
            onChange={(v) => update('terminalStartupCommand', v)}
            placeholder="e.g., echo 'Hello'"
          />

        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>General</div>

          <ToggleRow
            label="Confirm on close"
            description="Show confirmation when closing tabs with unsaved changes"
            value={settings.confirmOnClose}
            onChange={(v) => update('confirmOnClose', v)}
          />

          <ToggleRow
            label="Auto-save on blur"
            description="Automatically save files when switching away from a tab"
            value={settings.autoSaveOnBlur}
            onChange={(v) => update('autoSaveOnBlur', v)}
          />

          <ToggleRow
            label="Restore project"
            description="Restore the last active project when the app starts"
            value={settings.restoreProject}
            onChange={(v) => update('restoreProject', v)}
          />

          <ToggleRow
            label="Inline diffs"
            description="Show diffs inline instead of side-by-side"
            value={settings.diffInline}
            onChange={(v) => update('diffInline', v)}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Keyboard Shortcuts</div>

          {SHORTCUTS.map((s) => (
            <div key={s.action} className={styles.shortcutRow}>
              <span className={styles.shortcutAction}>{s.action}</span>
              <kbd className={styles.kbd}>{s.keys}</kbd>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
