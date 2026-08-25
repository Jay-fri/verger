import { app, BrowserWindow, Menu, shell } from "electron";
import { createConsoleWindow } from "./windows/console-window";
import { createStageWindow } from "./windows/stage-window";
import { startFrameCapture, logMeasuredFrameRate } from "./ndi/frame-capture";
import { createNdiSender, type NdiSender } from "./ndi/ndi-sender";

// Checkpoint 1: two windows, clean lifecycle. Checkpoint 2: capture frames
// from the hidden window at a steady rate. Checkpoint 3 (this file): publish
// those frames as an NDI source via grandiose. See
// verger-project-overview.md's "Desktop NDI bridge" section for the full
// incremental build order this follows.

const TARGET_FPS = 30;
const NDI_SOURCE_NAME = process.env.VERGER_NDI_NAME || "Verger Stage Output";

// Without this, an offscreen window on a Retina/HiDPI display captures at
// the OS's device pixel ratio (measured: a declared 1920x1080 window came
// back as 3840x2160 on this machine's 2x display) — quadrupling the pixel
// count NDI has to send for a plain text/verse overlay, for zero visual
// benefit at typical vMix output resolutions. Must be set before app is
// ready; affects every window this app creates.
app.commandLine.appendSwitch("force-device-scale-factor", "1");

let consoleWindow: BrowserWindow | null = null;
let stageWindow: BrowserWindow | null = null;
let stopCapture: (() => void) | null = null;
let ndiSender: NdiSender | null = null;

async function teardown() {
  stopCapture?.();
  stopCapture = null;
  await ndiSender?.close();
  ndiSender = null;
  stageWindow?.destroy();
  stageWindow = null;
}

// NDI SDK license requirement: "a link to ndi.video in a location close to
// all locations where NDI is used/selected within the product." This app's
// only "product surface" is its menu bar (the console window shows the web
// app, not our own UI) — see README.md's "NDI attribution" section for the
// rest of the requirement (also required: on the app's docs/website).
function installAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
    },
    {
      label: "NDI",
      submenu: [
        {
          label: "About NDI®",
          click: () => shell.openExternal("https://ndi.video"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  console.info("[main] app ready — creating windows");
  installAppMenu();

  consoleWindow = createConsoleWindow();
  stageWindow = createStageWindow();

  // NDI SOURCE_NAME per the license's attribution requirement — see
  // ndi-sender.ts and the README for the full ndi.video link/trademark
  // notice this app carries. If this rejects (e.g. the NDI runtime isn't
  // present), the windows still work — a broken NDI source shouldn't take
  // down the console the operator is actively using to run the service.
  try {
    ndiSender = await createNdiSender(NDI_SOURCE_NAME, TARGET_FPS);
  } catch (err) {
    console.error("[main] failed to create NDI sender — continuing without NDI output:", err);
  }

  const measureFps = logMeasuredFrameRate("stage window", 2);
  stopCapture = startFrameCapture(
    stageWindow,
    (frame) => {
      measureFps(frame);
      ndiSender?.publish(frame);
    },
    TARGET_FPS,
  );

  // The hidden Stage window doesn't count toward Electron's own
  // window-all-closed bookkeeping any differently than a visible one — but
  // from the operator's perspective, closing the (only visible) console
  // window IS "closing the app." Without this, the hidden window (and the
  // NDI source) would keep running invisibly forever with no way to quit.
  consoleWindow.on("closed", () => {
    console.info("[main] console window closed — tearing down stage window and NDI source");
    teardown();
    consoleWindow = null;
  });
});

app.on("window-all-closed", () => {
  console.info("[main] all windows closed — quitting");
  app.quit();
});

app.on("before-quit", () => {
  teardown();
});
