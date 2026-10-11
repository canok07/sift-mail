const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
test('Desktop opens provider OAuth in the system browser and never allows an embedded popup', async () => {
  let handler; const external = [];
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = { setWindowOpenHandler(fn) { handler = fn; }, on() {} }; }
    async loadURL() {} isDestroyed() { return false; }
  }
  class Tray { setToolTip() {} setContextMenu() {} on() {} }
  const app = Object.assign(new EventEmitter(), { requestSingleInstanceLock: () => true, quit() {}, whenReady: () => Promise.resolve(), getAppPath: () => process.cwd(), getPath: () => process.cwd() });
  const electron = { app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: () => [] }, dialog: { showErrorBox() { throw Error('Unexpected startup error'); } }, shell: { openExternal(url) { external.push(url); return Promise.resolve(); } }, session: { defaultSession: { clearStorageData: async () => {} } } };
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
  vm.runInNewContext(fs.readFileSync('apps/desktop/electron/main.cjs', 'utf8'), {
    require: name => name === 'electron' ? electron : name === 'node:child_process' ? { fork() { setImmediate(() => child.emit('message', { type: 'sift-ready', port: 47831 })); return child; } } : name === 'node:fs' ? { appendFileSync() {} } : require(name),
    process, URL, setTimeout, clearTimeout,
  });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(typeof handler, 'function');
  for (const url of ['https://accounts.google.com/o/oauth2/v2/auth', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize']) assert.equal(handler({ url }).action, 'deny');
  assert.deepEqual(external, ['https://accounts.google.com/o/oauth2/v2/auth', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize']);
  for (const url of ['javascript:alert(1)', 'file:///C:/private', 'not a URL']) assert.equal(handler({ url }).action, 'deny');
  assert.equal(external.length, 2);
});
