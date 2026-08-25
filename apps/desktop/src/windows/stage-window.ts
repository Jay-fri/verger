import { BrowserWindow, screen } from "electron";

// A tiny self-contained animated page — the default when VERGER_STAGE_URL
// isn't set, so window lifecycle (checkpoint 1) and frame capture rate
// (checkpoint 2) can both be verified without apps/web or a real service
// running. A moving element plus a live timestamp makes a stale/frozen
// capture obvious at a glance, not just a static screenshot. Sized in
// viewport units (not hardcoded 1920x1080px) so it fills whatever DIP
// viewport the window is actually given — see the scale-factor comment
// below for why that's not always 1920x1080 in CSS pixels.
const TEST_PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; background: #121212; overflow: hidden; }
  #dot {
    position: absolute; top: 50%; left: 0; width: 80px; height: 80px; margin-top: -40px;
    border-radius: 50%; background: #f5a623;
    animation: sweep 3s linear infinite;
  }
  @keyframes sweep { from { left: 0; } to { left: calc(100vw - 80px); } }
  #clock {
    position: absolute; top: 40px; left: 40px; color: #f5f5f5;
    font: 48px -apple-system, sans-serif;
  }
</style>
</head>
<body>
  <div id="dot"></div>
  <div id="clock">0</div>
  <script>
    function tick() {
      document.getElementById("clock").textContent = new Date().toISOString();
      requestAnimationFrame(tick);
    }
    tick();
  </script>
</body>
</html>`;

const DEFAULT_STAGE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(TEST_PAGE_HTML)}`;

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

// show:false + offscreen:true is what makes this genuinely headless — no OS
// window is ever created, but Chromium still renders into a bitmap buffer
// we can read via the "paint" event (see ../ndi/frame-capture.ts, wired up
// in checkpoint 2).
export function createStageWindow(): BrowserWindow {
  const url = process.env.VERGER_STAGE_URL || DEFAULT_STAGE_URL;

  // OSR captures at *physical* pixels — a declared 1920x1080 BrowserWindow
  // (which is sized in DIP/CSS pixels, like all Electron/Chromium window
  // sizing) came back as a 3840x2160 captured buffer on this machine's 2x
  // Retina display; app.commandLine's force-device-scale-factor switch
  // (the usual fix for normal windows) has no effect on OSR specifically.
  // Compensating the declared DIP size by the real scale factor is what
  // actually lands on an exact 1920x1080 physical-pixel capture regardless
  // of the host display — verified empirically on this machine, not just
  // from docs (Electron's OSR docs don't cover this).
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1;
  const dipWidth = Math.round(TARGET_WIDTH / scaleFactor);
  const dipHeight = Math.round(TARGET_HEIGHT / scaleFactor);

  const win = new BrowserWindow({
    width: dipWidth,
    height: dipHeight,
    show: false,
    webPreferences: {
      // Forces the legacy CPU/bitmap-copy OSR path rather than the newer
      // GPU zero-copy path — the shared-texture path behaved differently
      // in early testing here, so pinning to the well-understood path.
      offscreen: { useSharedTexture: false },
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(url).catch((err) => {
    console.error(`[stage-window] failed to load: ${err}`);
  });

  win.webContents.on("did-finish-load", () => {
    console.info(
      `[stage-window] loaded (offscreen, ${dipWidth}x${dipHeight} DIP @ ${scaleFactor}x -> ${TARGET_WIDTH}x${TARGET_HEIGHT} captured)`,
    );
  });

  return win;
}
