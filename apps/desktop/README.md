# @verger/desktop

Electron NDI bridge — the desktop companion app described in
[verger-project-overview.md](../../verger-project-overview.md)'s "Desktop NDI bridge" section. It
exists solely to expose the web app's Stage output route as an NDI source, since a browser tab
can't emit NDI directly.

**Structure**: two windows —

- A **visible window** loading the Control console (`apps/web`, either a deployed URL or a local
  dev server — see "Configuration" below).
- A **hidden/offscreen window** loading the Stage output route. Its rendered frames are captured
  (`src/ndi/frame-capture.ts`) and published as an NDI source (`src/ndi/ndi-sender.ts`, via
  [`grandiose`](https://github.com/rse/grandiose)) so it appears as a named input inside vMix.

## NDI® attribution

This app uses the NDI® SDK under Vizrt NDI AB's [SDK license](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing),
which is royalty-free but requires: a link to [ndi.video](https://ndi.video) near where NDI is
used/selected in the product, the NDI® trademark attributed near first use, and the NDI
redistributable bundled inside this app's own install folder (not assumed to be globally
installed on the end user's machine). In this app: the link/trademark live in the menu bar's
"NDI" menu (`src/main.ts`) and here in this README; the redistributable is bundled via
`electron-builder`'s `extraResources` (see `electron-builder.yml`) rather than requiring a
separate NDI Tools install on the machine running the packaged app.

NDI® is a registered trademark of Vizrt NDI AB.

## Prerequisites (development machine only)

Building `grandiose`'s native addon requires a C++ toolchain (Xcode Command Line Tools on macOS,
Visual Studio Build Tools on Windows) and Python — both `node-gyp` requirements, unrelated to NDI
itself. `grandiose`'s own install step downloads the NDI SDK headers/libs it needs to compile
automatically; nothing needs to be pre-installed for that part.

To **visually verify** an NDI source (as opposed to just compiling successfully), install
[NDI Tools](https://ndi.video/tools/) and use its Studio Monitor (named "NDI Video Monitor" in
recent releases) — free, no account needed beyond the download form.

## Why `grandiose` is installed from a GitHub fork, not npm

The `grandiose` package published to npm (`grandiose@0.0.4`, from
[Streampunk/grandiose](https://github.com/Streampunk/grandiose)) is unmaintained (last published
2018) and **does not build on macOS or Linux** — its bundled SDK lib folder only contains a
Windows `.dll`, and its native source uses `itoa`, a Windows-only (non-POSIX) libc function. This
package instead depends on [`rse/grandiose`](https://github.com/rse/grandiose) (a maintained fork
with cross-platform fixes and a newer bundled NDI SDK) via a direct GitHub reference.

Two real gaps found between `grandiose`'s published `index.d.ts` and what its native addon
actually does at runtime (verified empirically, not assumed — see `src/ndi/ndi-sender.ts`'s doc
comments):

- `send()` resolves a `Promise<Sender>`, not a synchronous `Sender` as declared.
- A video frame's `timecode` field must be a plain `bigint` (or `number`), not the
  `[seconds, nanoseconds]` tuple the type declares — the native addon throws
  `"timecode value must be a number or bigint"` otherwise.

`ndi-sender.ts` defines its own corrected types for exactly this reason rather than trusting the
package's published `.d.ts`.

## Native module vs. Electron's Node ABI

`grandiose` compiles against whatever Node.js runs `pnpm install` — which is your system Node, not
the (different) Node version Electron bundles internally. A native addon compiled for the wrong
ABI fails to load inside Electron at all. This package's `postinstall` script
(`electron-rebuild -f -w grandiose`) recompiles it specifically for Electron's ABI; it runs
automatically after `pnpm install`.

## Configuration

Both windows' URLs are read from environment variables, defaulting to safe, dependency-free values
so the app can be verified without `apps/web` (or a real service) running at all:

| Variable             | Default                                          | Purpose                              |
| --------------------- | ------------------------------------------------- | ------------------------------------- |
| `VERGER_CONSOLE_URL`  | `about:blank`                                     | The visible window — point this at a deployed Vercel URL or a local `apps/web` dev server (e.g. `http://localhost:3000/dashboard`). |
| `VERGER_STAGE_URL`    | a small bundled animated test page                 | The hidden window — point this at a real `/stage/[serviceId]` URL once you have a service to test against. |
| `VERGER_NDI_NAME`     | `Verger Stage Output`                              | The name this app's NDI source appears under in vMix/Studio Monitor. |

## Scripts

```bash
pnpm build       # tsc -> dist/
pnpm dev         # build, then launch electron .
pnpm typecheck
pnpm lint
pnpm dist:win    # build, then package a Windows installer via electron-builder
```

## Incremental verification checkpoints

This app was built and verified in the order the overview doc specifies — each one confirmed
working (real Electron processes, measured frame rates, a real NDI source appearing) before moving
to the next:

1. Two windows (visible console + hidden/offscreen Stage), clean open/close lifecycle, zero
   orphaned processes on quit.
2. Frames captured from the hidden window at a steady, declared frame rate (not just "whenever
   Chromium happens to repaint") — including fixing an OSR-specific Retina scaling bug where a
   declared 1920x1080 window captured at 3840x2160.
3. Frames published as a real NDI source via `grandiose`, confirmed live and steady in-process.
4. NDI source + alpha/transparency path verified in vMix specifically (transparency is a known
   risk — NDI alpha support varies by tooling version — so this is validated explicitly, not
   assumed from #3 working).
5. Packaged as a Windows installer (`electron-builder`, NSIS target) and run on a machine that
   never had this repo's toolchain on it.
