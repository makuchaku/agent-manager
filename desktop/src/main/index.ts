import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { NotificationWatcher } from './notification-watcher'
import { IPC } from '../shared/ipc-channels'

let mainWindow: BrowserWindow | null = null
let notificationWatcher: NotificationWatcher | null = null

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
   // By default, the global Application Menubar is shown to provide standard
   // desktop experience. Users can hide it via the ENABLE_MENUBAR environment
   // variable for a cleaner interface.
   //
   // Environment Variable: ENABLE_MENUBAR
   // Default: true (menubar shown)
   // Set value to "false" or "0" to hide the menubar.
   // ============================================================================
   const menuEnabled = process.env.ENABLE_MENUBAR !== 'false' && process.env.ENABLE_MENUBAR !== '0'

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
        // IMPORTANT: These role-based menu items use SYSTEM DEFAULTS for copy/paste.
        // They do NOT force shortcut interception - instead, they rely on Electron's
        // native behavior which respects focus context. When the terminal is focused,
        // Ctrl/Cmd+C/V will be handled by xterm.js (terminal copy/paste). When other
        // UI elements are focused, these will trigger standard copy/paste operations.
        // This design ensures terminal users get expected behavior (Ctrl+C sends SIGINT
        // when no selection, copies when text is selected) while maintaining standard
        // editing capabilities elsewhere in the app.
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
               { type: 'separator' as const },
               {
                 label: 'Reset UI Layout',
                 accelerator: 'CmdOrCtrl+Shift+0',
                 click: () => {
                   const focusedWindow = BrowserWindow.getFocusedWindow()
                   if (focusedWindow) {
                     focusedWindow.webContents.send(IPC.UI_RESET_LAYOUT)
                   }
                 },
               },
             ],
           }]
         : [{
             label: 'View',
             submenu: [
               { type: 'separator' as const },
               {
                 label: 'Reset UI Layout',
                 accelerator: 'CmdOrCtrl+Shift+0',
                 click: () => {
                   const focusedWindow = BrowserWindow.getFocusedWindow()
                   if (focusedWindow) {
                     focusedWindow.webContents.send(IPC.UI_RESET_LAYOUT)
                   }
                 },
               },
             ],
           }]),
      {
        label: 'Window',
        submenu: [{ role: 'minimize' as const }, { role: 'zoom' as const }],
      },
    ]
    const menu = Menu.buildFromTemplate(menuTemplate)
    Menu.setApplicationMenu(menu)
  }

  registerIpcHandlers()
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
