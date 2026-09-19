const { app, BrowserWindow, dialog, shell, session } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

let window = null;
let backend = null;
let quitting = false;
let baseUrl = null;
let logFile;

function log(message) {
  if (logFile) fs.appendFileSync(logFile, new Date().toISOString() + ' ' + message + '\n');
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Yerel sunucu 30 saniye içinde başlayamadı.')), 30000);
    const child = fork(path.join(app.getAppPath(), 'dist', 'server.cjs'), [], {
      execPath: process.execPath,
      cwd: app.getPath('userData'),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', PORT: '47831', HOST: '127.0.0.1',
        SIFT_DIST_PATH: path.join(app.getAppPath(), 'dist'),
        SIFT_DATA_DIR: path.join(app.getPath('userData'), 'data'),
        VERCEL: '', VERCEL_ENV: '', AWS_LAMBDA_FUNCTION_NAME: '',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });
    backend = child;
    // Do not log mail content, credentials or provider responses.
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    child.once('error', error => {
      clearTimeout(timer);
      log('Backend start error: ' + (error.code || error.name));
      reject(error);
    });
    child.on('message', message => {
      if (message?.type === 'sift-ready' && Number.isInteger(message.port) && message.port > 0) {
        clearTimeout(timer);
        resolve('http://127.0.0.1:' + message.port);
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (backend === child) backend = null;
      const error = new Error('Yerel sunucu kapandı (kod: ' + code + ', sinyal: ' + (signal || '-') + ').');
      log(error.message);
      reject(error);
      if (baseUrl && !quitting) {
        dialog.showErrorBox('Sift bağlantısı kesildi', error.message + '\nUygulamayı yeniden açın.');
        app.quit();
      }
    });
  });
}

async function createWindow() {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  const current = new BrowserWindow({
    width: 1280, height: 850, minWidth: 900, minHeight: 600,
    title: 'Sift Mail', backgroundColor: '#09090b', icon: path.join(app.getAppPath(), 'public', 'sift-mail-icon.png'),
    show: false, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window = current;
  current.once('closed', () => {
    if (window === current) window = null;
  });
  current.once('ready-to-show', () => {
    if (!current.isDestroyed()) current.show();
  });
  current.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (target.hostname === 'login.microsoftonline.com' || target.hostname === 'accounts.google.com' || target.hostname.endsWith('.yandex.com')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    }
    if (target.protocol === 'https:') shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  current.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== baseUrl) event.preventDefault();
  });
  try {
    await current.loadURL(baseUrl);
  } catch (error) {
    if (!current.isDestroyed() && !quitting) {
      dialog.showErrorBox('Sift açılamadı', error.message);
      app.quit();
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (baseUrl && !quitting) void createWindow();
  });
  app.on('before-quit', () => {
    quitting = true;
    if (backend) backend.kill();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    logFile = path.join(app.getPath('userData'), 'startup.log');
    try {
      await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
      baseUrl = await startBackend();
      if (!quitting) await createWindow();
    } catch (error) {
      log('Startup failed: ' + error.message);
      dialog.showErrorBox('Sift başlatılamadı', error.message + '\nKayıt: ' + logFile);
      app.quit();
    }
  }).catch(error => {
    dialog.showErrorBox('Sift başlatılamadı', error.message);
    app.quit();
  });
}
