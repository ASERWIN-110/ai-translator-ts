import { app, BrowserWindow, Menu, shell } from "electron";
import { join } from "node:path";
import type { StartedServer } from "./server.js";

let mainWindow: BrowserWindow | undefined;
let startedServer: StartedServer | undefined;

async function createWindow(): Promise<void> {
  process.env.AI_TRANSLATOR_HOME = app.getPath("userData");
  process.env.AI_TRANSLATOR_PUBLIC_ROOT = join(app.getAppPath(), "public");
  process.env.AI_TRANSLATOR_TEMPLATE_ROOT = join(app.getAppPath(), "data", "upstream-templates", "模板");
  process.env.AI_TRANSLATOR_PORT = "0";
  const { startServer } = await import("./server.js");
  startedServer = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "AI Translator TS",
    backgroundColor: "#f4f5f7",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(buildMenu());
  mainWindow.loadURL(startedServer.url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!startedServer || url.startsWith(startedServer.url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open Data Folder",
          click: () => shell.openPath(app.getPath("userData"))
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Project Folder",
          click: () => shell.openPath(join(app.getAppPath()))
        }
      ]
    }
  ]);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  startedServer?.server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
