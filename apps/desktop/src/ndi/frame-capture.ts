import type { BrowserWindow, Rectangle, NativeImage } from "electron";

export type CapturedFrame = {
  width: number;
  height: number;
  /** BGRA, 8 bits per channel — what NativeImage.toBitmap() returns on macOS/Windows, and also FourCC.BGRA's exact byte layout in grandiose (see ../ndi/ndi-sender.ts). No conversion needed between the two. */
  bitmap: Buffer;
  timestamp: number;
};

/**
 * Drives the offscreen Stage window at a steady, broadcast-appropriate
 * frame rate rather than relying solely on Chromium's content-driven paint
 * events. An offscreen window's "paint" event only fires by default when
 * something visually changes — fine for a CSS animation, but a static verse
 * with no motion would stop producing frames entirely, which is wrong for
 * an NDI feed a vision mixer expects to keep receiving. `invalidate()`
 * forces a repaint on a timer regardless of whether content actually
 * changed, so the output frame rate is constant either way.
 */
export function startFrameCapture(
  win: BrowserWindow,
  onFrame: (frame: CapturedFrame) => void,
  targetFps = 30,
): () => void {
  const wc = win.webContents;
  wc.setFrameRate(targetFps);

  // Chromium's own compositor also paints an OSR window on its own (e.g.
  // whenever animating CSS content changes), independent of our invalidate()
  // calls below — measured in practice at ~50-57 "paint" events/sec against
  // a 30fps target on an animating test page, roughly the sum of both
  // sources. Emitting every paint event downstream would send NDI frames
  // faster than the rate we declare to it. So "paint" only ever updates
  // `latest`; a single timer, ticking at exactly targetFps, is what decides
  // when a frame actually goes out — decoupling "how often Chromium happens
  // to repaint" from "how often we emit," which is what a receiver expects
  // from a declared frame rate.
  let latest: CapturedFrame | null = null;
  const onPaint = (_event: unknown, _dirty: Rectangle, image: NativeImage) => {
    const { width, height } = image.getSize();
    if (width === 0 || height === 0) return; // can happen on the very first paint before layout settles
    latest = { width, height, bitmap: image.toBitmap(), timestamp: Date.now() };
  };
  wc.on("paint", onPaint);

  const intervalMs = Math.round(1000 / targetFps);
  const tickTimer = setInterval(() => {
    if (wc.isDestroyed()) return;
    wc.invalidate();
    if (latest) onFrame(latest);
  }, intervalMs);

  return function stopFrameCapture() {
    clearInterval(tickTimer);
    if (!wc.isDestroyed()) wc.off("paint", onPaint);
  };
}

/** Rolling actual-FPS counter, purely for checkpoint verification/logging — not part of the capture path itself. */
export function logMeasuredFrameRate(label: string, windowSeconds = 2): (frame: CapturedFrame) => void {
  let count = 0;
  let windowStart = Date.now();
  return () => {
    count++;
    const elapsed = Date.now() - windowStart;
    if (elapsed >= windowSeconds * 1000) {
      console.info(`[frame-capture] ${label}: ${(count / (elapsed / 1000)).toFixed(1)} fps measured`);
      count = 0;
      windowStart = Date.now();
    }
  };
}
