import { app, BrowserWindow, Menu, shell } from "electron";
import { join } from "node:path";
import type { StartedServer } from "./server.js";

let mainWindow: BrowserWindow | undefined;
let startedServer: StartedServer | undefined;

async function createWindow(): Promise<void> {
  process.env.AI_TRANSLATOR_HOME = join(app.getPath("userData"), "embedded");
  process.env.AI_TRANSLATOR_PUBLIC_ROOT = join(app.getAppPath(), "public");
  process.env.AI_TRANSLATOR_TEMPLATE_ROOT = join(app.getAppPath(), "data", "upstream-templates", "模板");
  process.env.AI_TRANSLATOR_PORT = "0";
  process.env.AI_TRANSLATOR_EDITION = "embedded";

  const { startServer } = await import("./server.js");
  startedServer = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 700,
    title: "AI Translator TS Embedded",
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
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open Embedded Data Folder",
          click: () => shell.openPath(app.getPath("userData"))
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }]
    }
  ]);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  startedServer?.server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
