import { BrowserWindow, screen } from "electron";

// A tiny self-contained animated page — the default when VERGER_STAGE_URL
// isn't set, so window lifecycle (checkpoint 1) and frame capture rate
// (checkpoint 2) can both be verified without apps/web or a real service
// running. A moving element plus a live timestamp makes a stale/frozen
// capture obvious at a glance, not just a static screenshot. Sized in
// viewport units (not hardcoded 1920x1080px) so it fills whatever DIP
// viewport the window is actually given — see the scale-factor comment
// below for why that's not always 1920x1080 in CSS pixels.
function testPageHtml(transparentBg: boolean): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; background: ${transparentBg ? "transparent" : "#121212"}; overflow: hidden; }
  #dot {
    position: absolute; top: 50%; left: 0; width: 80px; height: 80px; margin-top: -40px;
    border-radius: 50%; background: #f5a623;
    animation: sweep 3s linear infinite;
  }
  @keyframes sweep { from { left: 0; } to { left: calc(100vw - 80px); } }
  #clock {
    position: absolute; top: 40px; left: 40px; color: #f5f5f5;
    font: 48px -apple-system, sans-serif;
    ${transparentBg ? "text-shadow: 0 2px 8px rgba(0,0,0,0.8);" : ""}
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
}

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;

// show:false + offscreen:true is what makes this genuinely headless — no OS
// window is ever created, but Chromium still renders into a bitmap buffer
// we can read via the "paint" event (see ../ndi/frame-capture.ts, wired up
// in checkpoint 2).
export function createStageWindow(): BrowserWindow {
  // VERGER_STAGE_TEST_TRANSPARENT=1 loads a page with NO opaque background
  // at all (not even the test page's usual #121212) — for verifying the
  // alpha/transparency capture path in isolation, without needing the real
  // web app or a service running. The real path is apps/web's Stage route
  // with ?bg=transparent (point VERGER_STAGE_URL at that once you have a
  // service to test against).
  const testTransparent = process.env.VERGER_STAGE_TEST_TRANSPARENT === "1";
  const url = process.env.VERGER_STAGE_URL || dataUrl(testPageHtml(testTransparent));

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
    // Unconditional, not tied to whether the loaded page is actually
    // transparent: when the page has its own opaque background (the normal
    // case — the default test page, or the Stage route without
    // ?bg=transparent), Chromium composites that opaque content over this
    // window's transparent base and the captured alpha is still 255
    // everywhere, unchanged. Only a page with no opaque background of its
    // own (the Stage route's ?bg=transparent mode, or
    // VERGER_STAGE_TEST_TRANSPARENT) actually produces sub-255 alpha. So
    // there's no separate "transparent window mode" to toggle — this is
    // just baseline capability the loaded page opts into or doesn't.
    transparent: true,
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
      `[stage-window] loaded (offscreen, ${dipWidth}x${dipHeight} DIP @ ${scaleFactor}x -> ${TARGET_WIDTH}x${TARGET_HEIGHT} captured` +
        `${testTransparent ? ", transparent test page" : ""})`,
    );
  });

  return win;
}
