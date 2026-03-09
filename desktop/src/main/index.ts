import { app, BrowserWindow, Menu, shell, powerMonitor } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { catchUpAutomationsOnWake, registerIpcHandlers } from './ipc'
import { NotificationWatcher } from './notification-watcher'

let mainWindow: BrowserWindow | null = null
let notificationWatcher: NotificationWatcher | null = null
let lastWakeCatchUpAt = 0

function triggerAutomationWakeCatchUp(reason: 'resume' | 'unlock-screen'): void {
  const now = Date.now()
  if (now - lastWakeCatchUpAt < 2000) return
  lastWakeCatchUpAt = now

  catchUpAutomationsOnWake(new Date(now)).catch((err) => {
    console.error(`[automation] wake catch-up failed (${reason}):`, err)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // Window size defaults to monitor bounds when maximize is enabled.
    // Fixed dimensions removed to allow full-screen maximize on startup.
    minWidth: 1024,   // Fallback minimum for smaller monitors (increased from 900)
    minHeight: 768,   // Fallback minimum for smaller monitors (increased from 600)
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#13141b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
      webviewTag: true, // needed for Gemini view
    },
    maximize: true,  // Launch window in maximized state on all platforms
  })

  /**
   * Document window configuration options for other developers:
   * - minWidth/minHeight: Minimum bounds enforced on all platforms. Set higher than
   *   typical content area since maximize will fill the monitor regardless.
   * - show: false — Prevents white flash during content loading. Window shows only after
   *   'ready-to-show' event fires.
   * - trafficLightPosition: Required for macOS when using hiddenInset titleBarStyle.
   *   Positions the red/yellow/green buttons at screen coordinate (12, 12).
   */

  // Show window when ready and maximize to fill current monitor bounds.
  // Called after content is fully loaded to avoid UI flicker or incomplete render.

  if (!process.env.CI_TEST) {
    mainWindow.on('ready-to-show', () => {
      mainWindow?.show()
      mainWindow?.maximize() // Force maximized state on launch
    })
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('MakuLabs Manager')

// Isolate test data so e2e tests never touch real app state
if (process.env.CI_TEST) {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const testData = mkdtempSync(join(require('os').tmpdir(), 'makulabs-manager-test-'))
  app.setPath('userData', testData)
  process.env.MAKULABS_MANAGER_AGENT_EVENT_DIR ||= join(testData, 'agent-events')
}

app.whenReady().then(() => {
  const isDev = !!process.env.ELECTRON_RENDERER_URL

  // ============================================================================
  // MENUBAR CONFIGURATION
  // By default, the global Application Menubar is hidden to provide a cleaner
  // desktop experience. Users can enable it via the ENABLE_MENUBAR environment
  // variable for debugging or accessibility purposes.
  //
  // Environment Variable: ENABLE_MENUBAR
  // Default: false (menubar hidden)
  // Set value to "true" or "1" to show the menubar.
  // ============================================================================
  const menuEnabled = process.env.ENABLE_MENUBAR === 'true' || process.env.ENABLE_MENUBAR === '1'

  if (!menuEnabled) {
    // Hide the global Application Menubar entirely on all platforms (macOS, Windows, Linux)
    // This removes the top-level menu items while keeping window controls and keyboard shortcuts functional
    Menu.setApplicationMenu(null)
  } else {
    // Custom menu: keep standard Edit shortcuts (copy/paste/undo) but remove
    // Cmd+W (close window) and Cmd+N (new window) so they reach the renderer
    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      ...(isDev
        ? [{
            label: 'View',
            submenu: [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { type: 'separator' as const },
              { role: 'toggleDevTools' as const },
            ],
          }]
        : []),
      {
        label: 'Window',
        submenu: [{ role: 'minimize' as const }, { role: 'zoom' as const }],
      },
    ]
    const menu = Menu.buildFromTemplate(menuTemplate)
    Menu.setApplicationMenu(menu)
  }

  registerIpcHandlers()
  powerMonitor.on('resume', () => triggerAutomationWakeCatchUp('resume'))
  powerMonitor.on('unlock-screen', () => triggerAutomationWakeCatchUp('unlock-screen'))
  notificationWatcher = new NotificationWatcher()
  notificationWatcher.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  notificationWatcher?.stop()
})
