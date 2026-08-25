import grandioseRaw from "grandiose";
import type { CapturedFrame } from "./frame-capture";

// grandiose's own .d.ts doesn't match what its native addon actually
// accepts at runtime — verified empirically with a standalone smoke test
// (plain Node, outside Electron) before wiring this in:
//   - send() resolves a Promise<Sender>, not a bare Sender as declared.
//   - a video frame's `timecode` must be a plain bigint (or number), not
//     the [seconds, nanoseconds] tuple the .d.ts claims — passing a tuple
//     throws "timecode value must be a number or bigint" from the native
//     addon itself (src/grandiose_send.cc).
// The types below describe the real runtime shape; grandioseRaw is cast to
// this rather than trusted as its published types.
type GrandioseModule = {
  send(params: { name: string; groups?: string; clockVideo?: boolean; clockAudio?: boolean }): Promise<GrandioseSender>;
  FOURCC_BGRA: number;
  FORMAT_TYPE_PROGRESSIVE: number;
};

type GrandioseSender = {
  video(frame: GrandioseVideoFrame): Promise<void>;
  destroy?: () => Promise<void> | void;
};

type GrandioseVideoFrame = {
  type: "video";
  xres: number;
  yres: number;
  frameRateN: number;
  frameRateD: number;
  fourCC: number;
  pictureAspectRatio: number;
  timestamp: [number, number];
  frameFormatType: number;
  timecode: bigint;
  lineStrideBytes: number;
  data: Buffer;
};

const grandiose = grandioseRaw as unknown as GrandioseModule;

// NDIlib_send_timecode_synthesize from the NDI C SDK — tells NDI to
// generate a real timecode from its own clock rather than us supplying one.
// The C SDK defines this as INT64_MAX, which can't be represented exactly
// by a JS `number` (safe integers top out at 2^53), which is exactly why
// the native addon requires a bigint for this field instead.
const NDI_TIMECODE_SYNTHESIZE = 9223372036854775807n;

export type NdiSender = {
  publish: (frame: CapturedFrame) => void;
  close: () => Promise<void>;
};

/**
 * Wraps a grandiose Sender for the one thing this app needs: publish
 * whatever frame-capture.ts hands it. If a previous video() send hasn't
 * resolved yet, the new frame is dropped rather than queued — a live feed
 * should skip a frame under backpressure, never fall behind and then dump a
 * backlog of stale frames trying to catch up.
 */
export async function createNdiSender(name: string, fps: number): Promise<NdiSender> {
  console.info(`[ndi-sender] creating NDI source "${name}"...`);
  const sender = await grandiose.send({ name });
  console.info(`[ndi-sender] "${name}" is live — should now be visible to any NDI receiver on this network`);

  let sending = false;

  function publish(frame: CapturedFrame) {
    if (sending) return; // see doc comment above
    sending = true;
    sender
      .video({
        type: "video",
        xres: frame.width,
        yres: frame.height,
        frameRateN: fps,
        frameRateD: 1,
        fourCC: grandiose.FOURCC_BGRA,
        pictureAspectRatio: frame.width / frame.height,
        timestamp: [0, 0],
        frameFormatType: grandiose.FORMAT_TYPE_PROGRESSIVE,
        timecode: NDI_TIMECODE_SYNTHESIZE,
        lineStrideBytes: frame.width * 4,
        data: frame.bitmap,
      })
      .catch((err) => console.error("[ndi-sender] video() failed:", err))
      .finally(() => {
        sending = false;
      });
  }

  async function close() {
    console.info(`[ndi-sender] closing "${name}"`);
    await sender.destroy?.();
  }

  return { publish, close };
}
