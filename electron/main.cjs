// Electron Desktop Application Entry Point for Sift
// Native desktop window, system tray minimization, and background monitoring
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getIconPath() {
  const candidatePaths = [
    path.join(__dirname, '..', 'public', 'pwa-192x192.png'),
    path.join(app.getAppPath(), 'public', 'pwa-192x192.png'),
    path.join(__dirname, '..', 'dist', 'pwa-192x192.png'),
    path.join(app.getAppPath(), 'dist', 'pwa-192x192.png'),
    path.join(__dirname, '..', 'public', 'icon.svg'),
    path.join(app.getAppPath(), 'public', 'icon.svg'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '..', 'public', 'icon.svg');
}

function getDistIndexPath() {
  // Safe path resolution for dev, unpackaged, and packaged asar environments
  const candidatePaths = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(__dirname, 'dist', 'index.html'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'index.html'),
    path.join(process.resourcesPath || '', 'app', 'dist', 'index.html'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore virtual fs check errors
    }
  }
  // Default canonical fallback guaranteed to avoid null / blank screens
  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function createTray() {
  try {
    const iconPath = getIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Sift — AI-Powered Inbox',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Uygulamayı Aç',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      {
        label: 'Gelen Kutularını Şimdi Tara',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('trigger-refresh');
          }
        },
      },
      {
        label: 'Sistem Koruması: Aktif',
        type: 'checkbox',
        checked: true,
      },
      { type: 'separator' },
      {
        label: 'Tamamen Kapat (Çıkış)',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip('Sift (AI-Powered Inbox)');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (err) {
    console.warn('Tray başlatılamadı:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: 'Sift — AI-Powered Inbox',
    icon: getIconPath(),
    backgroundColor: '#09090b',
    show: false, // Prevents blank/black screen flash before content finishes loading
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  // Show window smoothly when initial content is painted
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Catch any load failures and attempt fallback to local server
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Sift] Page load failed (${errorCode}: ${errorDescription}) at ${validatedURL}`);
    if (mainWindow && !mainWindow.isDestroyed() && !validatedURL.includes('localhost')) {
      // Fallback attempt to local server if file load fails
      mainWindow.loadURL('http://localhost:3000').catch(() => {});
    }
  });

  // Load production dist index.html or dev server URL
  const distIndexPath = getDistIndexPath();
  if (distIndexPath && !isDev) {
    mainWindow.loadFile(distIndexPath).catch((err) => {
      console.error('[Sift] Failed to loadFile dist/index.html:', err);
      mainWindow.loadURL('http://localhost:3000').catch(() => {});
    });
  } else if (distIndexPath && !process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadFile(distIndexPath).catch(() => {
      mainWindow.loadURL('http://localhost:3000').catch(() => {});
    });
  } else if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  // Minimize to system tray when user clicks the (X) close button
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (Notification.isSupported()) {
        new Notification({
          title: 'Sift',
          body: 'Uygulama arka planda sistem tepsisinde çalışmaya ve gelen kutunuzu korumaya devam ediyor.',
          icon: getIconPath(),
        }).show();
      }
      return false;
    }
  });

  // Allow OAuth popups (Firebase Auth & Google Sign-In) to open as child windows with window.opener intact
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Check if this is an OAuth or Firebase authentication flow
    if (
      url.includes('firebaseapp.com') ||
      url.includes('accounts.google.com') ||
      url.includes('googleapis.com')
    ) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          modal: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }

    // All standard external links (unsubscribe links, external docs) open in default system browser
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single application instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Strip Electron from User-Agent to avoid Google OAuth disallowed_useragent security block
    try {
      if (app.userAgentFallback) {
        app.userAgentFallback = app.userAgentFallback.replace(/Electron\/[0-9\.]+\s/, '');
      }
    } catch {
      // ignore
    }

    createTray();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    // Keep running in system tray unless user explicitly quits
  });
}
