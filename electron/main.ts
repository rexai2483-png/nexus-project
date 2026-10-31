import path from "node:path";
import dotenv from "dotenv";

// Load .env in development only. Packaged builds carry no .env file and
// fall back to safe defaults resolved at runtime (see backend/db/client.ts).
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

import { app, BrowserWindow, session, shell } from "electron";
import { registerIpcHandlers } from "./ipc/handlers";
import { initBackend, shutdownBackend } from "../backend";

const isDev = process.env.NODE_ENV !== "production" && !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b0c0f",
    show: false,
    autoHideMenuBar: true,
    title: "NEXUS",
    webPreferences: {
      // Security baseline — do not weaken these without a strong reason.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Every external navigation/window-open opens in the OS browser instead
  // of inside the app — the renderer never gets a handle to arbitrary
  // webviews or shell access.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(DEV_SERVER_URL) && !url.startsWith("file://")) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function applyContentSecurityPolicy(): void {
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5173 http://localhost:5173; img-src 'self' data:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

app.whenReady().then(async () => {
  applyContentSecurityPolicy();
  registerIpcHandlers();
  await initBackend();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  await shutdownBackend();
  app.exit(0);
});

// Defense in depth: block any renderer from ever creating a new
// BrowserWindow/webview outside the single window this app manages.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
