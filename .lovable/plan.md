## Goal

Detect the user's hardware in the Cutter, pick the fastest path automatically, and let them override it. Add a WebCodecs fast path for cutting and audio extraction, and a GPU-accelerated lip-sync path using MediaPipe's WebGL/WebGPU delegate. Everything degrades cleanly to the current ffmpeg.wasm + CPU path.

## What the user sees

A small "Performance" control in the Cutter card:

```text
Performance: [ Auto ▾ ]   Detected: High (WebCodecs + GPU)
              ├─ Auto
              ├─ High   – WebCodecs decode/encode, GPU lip-sync
              ├─ Medium – ffmpeg.wasm tuned, GPU lip-sync
              └─ Low    – ffmpeg.wasm ultrafast, CPU lip-sync, 480p
```

Tooltip explains what each tier does. Choice persists in `localStorage` (`luxstream:perfTier`).

## Detection (new: `src/lib/perf/detect.ts`)

Probe once and cache:

- `navigator.hardwareConcurrency` (cores)
- `navigator.deviceMemory` (GB, Chrome/Edge)
- `crossOriginIsolated` + `SharedArrayBuffer` (needed for ffmpeg.wasm threads)
- `'VideoEncoder' in window` and `VideoEncoder.isConfigSupported({ codec: 'avc1.42E01F', ... })` — WebCodecs H.264 encode
- `'VideoDecoder' in window` and `VideoDecoder.isConfigSupported(...)` — WebCodecs H.264 decode
- `navigator.gpu?.requestAdapter()` — WebGPU
- WebGL2 canvas probe as a fallback GPU signal
- Adapter info (`adapter.info.vendor`, `adapter.info.architecture`) when available, to spot integrated vs discrete

Classify:

- **High**: WebCodecs encode+decode supported AND (WebGPU OR WebGL2) AND cores ≥ 8
- **Medium**: WebGL2 available AND cores ≥ 4 (no WebCodecs, or partial)
- **Low**: everything else, or user is on a phone (`navigator.userAgentData.mobile`)

Expose `getPerfTier()` and `usePerfTier()` hook.

## Fast paths

### 1. Cutting — WebCodecs (`src/lib/webcodecs/cut.ts`)

When tier = High and the source is MP4/H.264:

1. Demux with `mp4box.js` (small, MIT, ~120 KB) to get sample table.
2. Decode only the frames in `[start, end]` via `VideoDecoder`.
3. Re-encode the trimmed range with `VideoEncoder` (hardware-accelerated on Chrome/Edge/Safari).
4. Mux back to MP4 with `mp4box.js`.

This runs on GPU where available and is typically 5–20× faster than ffmpeg.wasm. Audio: use `AudioDecoder`/`AudioEncoder` for AAC when supported; otherwise skip audio in the fast path and fall through to ffmpeg.wasm.

If any step throws (unsupported codec, DRM, weird container), fall back to the existing `cutVideo` / `cutAndConcat` in `src/lib/ffmpeg/operations.ts`.

### 2. Audio extraction — WebCodecs (`src/lib/webcodecs/audio.ts`)

`AudioDecoder` → resample to 16 kHz mono via `OfflineAudioContext` → MP3 encode with `@breezystack/lamejs` (a maintained lamejs fork, tiny, no WASM). Falls back to ffmpeg.wasm `extractAudioMp3`.

### 3. ffmpeg.wasm tuning (existing path, now tier-driven)

Edit `PerfOptions` call sites in `SyncCalibrator`, cutter, premiere:

- High (fallback only): `preset veryfast`, `crf 20`, `threads = min(cores, 4)`, no downscale
- Medium: current defaults, `threads = 2`
- Low: `lowPerf: true`, `maxHeight: 480`, `threads = 1`

Also require `crossOriginIsolated` for threads > 1 (already true in this project via COOP/COEP headers — verify in `src/server.ts`).

### 4. Lip-sync — GPU delegate (`src/lib/lipsync/detectOffset.ts`)

Currently loads MediaPipe with implicit CPU delegate. Change to:

```ts
const delegate = tier === 'High' || tier === 'Medium' ? 'GPU' : 'CPU';
FaceLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath, delegate },
  ...
});
```

On High: also increase sampling from 20 fps to 30 fps and widen the search window from ±0.6 s to ±1.0 s (more accurate, still fast on GPU). Keep the existing painted-frame + timeout guards.

## UI wiring

- New `src/components/cutter/PerfSelector.tsx` — the dropdown + detected-tier chip.
- Add it to the Cutter card header in `src/routes/index.tsx` (or wherever the Cutter card lives — will confirm on read).
- `SyncCalibrator`, cut button, and burn button read the effective tier via `usePerfTier()` and pass matching `PerfOptions` / choose the WebCodecs path.

## Files touched

New:
- `src/lib/perf/detect.ts`
- `src/lib/perf/usePerfTier.ts`
- `src/lib/webcodecs/cut.ts`
- `src/lib/webcodecs/audio.ts`
- `src/components/cutter/PerfSelector.tsx`

Edited:
- `src/lib/ffmpeg/operations.ts` — tier-aware defaults, thread count derived from perf tier
- `src/lib/lipsync/detectOffset.ts` — accept `delegate` option, higher sampling on High
- `src/components/cutter/SyncCalibrator.tsx` — pass tier through
- `src/routes/index.tsx` — mount `PerfSelector`
- `package.json` — add `mp4box`, `@breezystack/lamejs`

No backend/worker changes. No Lovable Cloud changes.

## Risks / fallbacks

- WebCodecs H.264 encode is not on Firefox yet — detection covers that (Firefox lands on Medium).
- MediaPipe GPU delegate occasionally fails to init on some Intel iGPUs — wrap in try/catch and drop to CPU delegate silently.
- WebCodecs cut path only handles H.264 MP4 in v1; TS/HLS clips continue using ffmpeg.wasm (they already remux first).
- `mp4box` adds ~120 KB gzipped; lamejs fork ~50 KB. Both dynamically imported so the Cutter route only pays the cost when High tier is active.
