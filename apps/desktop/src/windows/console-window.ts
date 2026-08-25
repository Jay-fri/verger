import { BrowserWindow } from "electron";

// Loads the web app directly — a deployed Vercel URL in production, or a
// local dev server while testing. Same pattern as Slack/Discord desktop
// apps: the Electron shell has no UI of its own for this window, just a
// frame around the already-hosted web app. See verger-project-overview.md's
// "Desktop bridge" row.
const DEFAULT_CONSOLE_URL = "about:blank";

export function createConsoleWindow(): BrowserWindow {
  const url = process.env.VERGER_CONSOLE_URL || DEFAULT_CONSOLE_URL;

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Verger",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(url).catch((err) => {
    console.error(`[console-window] failed to load ${url}:`, err);
  });

  win.webContents.on("did-finish-load", () => {
    console.info(`[console-window] loaded ${url}`);
  });

  return win;
}
