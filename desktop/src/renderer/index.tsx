import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAppStore, hydrateFromDisk } from './store/app-store'
import { useEffect } from 'react'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'

// Expose store for e2e testing
;(window as any).__store = useAppStore

// Apply UI font size setting to CSS custom property
function UiFontSizeSetter() {
  const uiFontSize = useAppStore((s) => s.settings.uiFontSize)
  useEffect(() => {
    document.documentElement.style.setProperty('--text-base', `${uiFontSize}px`)
  }, [uiFontSize])
  return null
}

// Hydrate persisted state (tabs, PTYs) BEFORE rendering to avoid
// mounting terminals with stale pty IDs that get replaced moments later.
hydrateFromDisk().then(() => {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <StrictMode>
      <UiFontSizeSetter />
      <App />
    </StrictMode>
  )
})
