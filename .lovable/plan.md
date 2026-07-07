## Problem

Chamber TV's HLS master playlist puts **audio in a separate `#EXT-X-MEDIA TYPE=AUDIO` group**, not muxed into the video variant. The current recorder (`src/lib/hls/recorder.ts`) picks the highest-bandwidth video variant and downloads only its segments — so every `.ts` we save has **video only, no audio**.

Consequences:
- `remuxTsToMp4` fails: it applies `-bsf:a aac_adtstoasc` to a non-existent audio stream, and ffmpeg aborts.
- Even if remux succeeded, the MP4 would be silent — useless for a parliamentary channel.

## Fix, in two steps

### 1. Make remux tolerant so existing/silent .ts still previews

In `src/lib/ffmpeg/operations.ts → remuxTsToMp4`:
- Drop the hard `-bsf:a aac_adtstoasc` flag.
- Try `-c copy` first. If it fails, fall back to `-c:v copy` (video only, no audio mapping).
- Return whichever succeeds. The preview dialog then just plays a silent MP4 for legacy chunks.

Effect: live-snapshot preview and any previously recorded video-only `.ts` will start working today.

### 2. Record the audio group alongside the video, so new recordings have sound

In `src/lib/hls/parsePlaylist.ts` and `src/lib/hls/recorder.ts`:
- Extend `parseMaster` to also return `#EXT-X-MEDIA TYPE=AUDIO` entries (id, group-id, uri, default flag).
- When a variant declares `AUDIO="<group>"`, resolve the matching audio media playlist and poll it in parallel with the video playlist.
- Keep two segment buffers (video `.ts`, audio `.aac`/`.ts`). On `stop()` / `snapshot()`:
  - If audio is present, emit a small container: write both to ffmpeg.wasm and mux with `ffmpeg -i video.ts -i audio.aac -c copy out.ts` (fast, no re-encode). Return that combined blob.
  - If no separate audio group exists (normal muxed stream), keep the current fast path (just concatenate video segments).
- Storage stays `video/mp2t`; extension stays `.ts`; DB schema untouched.

Then update `remuxTsToMp4` to keep `aac_adtstoasc` as an **attempted** flag (still with the fallback from step 1) so new combined recordings remux cleanly to MP4 with audio.

### 3. Touch-ups

- `src/lib/hls/scheduled-recorder.ts`: no changes needed — it consumes whatever blob the recorder returns.
- `src/components/studio/LivePreview.tsx`: unchanged (it grabs frames from a `<video>` element pointed at the live URL, which is independent of what we record).
- Log a one-line note when the audio group is detected, so it's visible in the Studio log.

## Out of scope

- Re-processing already-saved silent recordings (they stay silent).
- Switching to `hls.js` or `mpegts.js` for playback — the remux path is enough.
- Any UI changes on Studio, Recordings, or Cutter.

## Files touched

- `src/lib/ffmpeg/operations.ts` — tolerant remux
- `src/lib/hls/parsePlaylist.ts` — parse audio media entries
- `src/lib/hls/recorder.ts` — parallel audio polling + mux on stop/snapshot