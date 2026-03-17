#!/usr/bin/env node
/**
 * Patches Electron for dev mode: replaces icon + sets app name.
 * Works on all platforms (Windows, macOS, Linux).
 * Run after `npm install`. Requires full app restart to take effect.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

console.log(`Patching Electron for ${process.platform}...`);

// Skip on Windows (no Electron.app structure)
if (isWindows) {
  console.log('Windows detected - skipping Electron.app patch (dev icon replacement not supported on Windows)');
  process.exit(0);
}

// macOS only
if (isMac) {
  const plistPath = path.join('node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Info.plist');
  const iconSource = path.join('build', 'icon.icns');
  const iconDest = path.join('node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Resources', 'electron.icns');

  if (!fs.existsSync(plistPath)) {
    console.log('Electron not installed yet, skipping patch');
    process.exit(0);
  }

  // Replace icon
  if (fs.existsSync(iconSource)) {
    try {
      fs.copyFileSync(iconSource, iconDest);
      console.log('Replaced electron.icns with custom icon');
    } catch (err) {
      console.error('Failed to replace icon:', err.message);
    }
  }

  // Update plist (requires PlistBuddy on macOS)
  try {
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'MakuLabs Manager'" "${plistPath}"`, { stdio: 'ignore' });
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName 'MakuLabs Manager'" "${plistPath}"`, { stdio: 'ignore' });
    console.log('Updated app name in Info.plist');
    
    // Re-register bundle
    const electronApp = path.join('node_modules', 'electron', 'dist', 'Electron.app');
    execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${electronApp}"`, { stdio: 'ignore' });
    console.log('Re-registered bundle with Launch Services');
  } catch (err) {
    console.error('Failed to update plist:', err.message);
  }
}

console.log('Patch complete. Restart the app to see changes.');
