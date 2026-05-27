import { app, BrowserWindow } from 'electron';
import { resolve } from 'path';
import { initializeDatabase, getDatabasePath } from './database';
import { setupIpcHandlers } from './ipc-handlers';
import { initWhatsApp, shutdownWhatsApp } from './whatsapp';

app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'LedgerMitra',
    webPreferences: {
      preload: resolve(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initializeDatabase(getDatabasePath());
  createWindow();
  setupIpcHandlers(mainWindow);
  initWhatsApp(mainWindow!);
});

app.on('window-all-closed', () => {
  shutdownWhatsApp();
  if (process.platform !== 'darwin') app.quit();
});
