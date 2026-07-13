## Goal

Use the font the user picks in the Cutter's new Font dropdown when ffmpeg burns subtitles, matching the shape:

```
ass=subs.ass:fontsdir=/fonts   +   Style ...,Fontname=<FamilyFromRow>,...
```

Today `burnSubtitles` always writes only `NotoSans-Regular.ttf` to `/fonts` and `cuesToAss` hardcodes `FONT_FAMILY = "Noto Sans"` in the ASS style line, so the dropdown selection is silently ignored.

## Changes

### 1. `src/lib/ffmpeg/operations.ts`

- Add a new type describing a custom font to install:
  ```ts
  export interface CustomFont {
    family: string;         // used as ASS Fontname
    storagePath: string;    // path inside the `fonts` bucket
    format: string;         // ttf | otf | woff | woff2
    bytes?: Uint8Array;     // optional pre-fetched content
  }
  ```
- Extend `ensureFont(ffmpeg, custom?)`:
  - Always ensures `/fonts` exists and the bundled Noto Sans fallback is present (kept as safety net if libass can't resolve the custom family).
  - When `custom` is provided, write its bytes to `/fonts/<sanitizedFamily>.<format>`. Cache by `(ffmpeg, family+storagePath)` in a `WeakMap<object, Set<string>>` so repeat burns skip the download.
  - If `custom.bytes` isn't supplied, download from Supabase: `supabase.storage.from("fonts").download(storagePath)` → `arrayBuffer()` → `Uint8Array`. Import `supabase` from `@/integrations/supabase/client`.
- Extend `cuesToAss(cues, style, fontFamily?)`: use `fontFamily ?? FONT_FAMILY` in the `Style: Default,<font>,...` line. Also update `getWrapCtx` to accept the family so wrap widths stay consistent with the preview (falls back to Noto Sans when none).
- Extend `burnSubtitles(video, assText, onP?, perf?, customFont?)`: pass `customFont` through to `ensureFont`. `fontsdir=/fonts` stays as is — libass will find the new file there.

### 2. `src/routes/index.tsx`

- Build a `resolveCustomFont()` helper right before each `burnSubtitles` call:
  - If `subFont === "default"` → pass `undefined`.
  - Otherwise find the row in `fontsListQuery.data` by `family === subFont`; return `{ family: row.family, storagePath: row.storage_path, format: row.format }`.
- Pass the resolved font to both `cuesToAss(..., subFont === "default" ? undefined : subFont)` and `burnSubtitles(..., customFont)` at the two existing burn sites (~lines 1116/1124 and 1363/1371).
- No change to the dropdown UI itself; `subFont` already holds the family string.

### 3. No DB / storage / RLS changes

The existing "authenticated can read fonts bucket" policy from the Fonts Manager migration already lets the Cutter download the file bytes.

## Verification

- `tsgo --noEmit` clean.
- Upload a distinctive font (e.g. a display face) via Admin → Fonts, select it in Cutter's Font dropdown, burn a short clip: rendered subtitles visibly use the uploaded typeface (not Noto Sans).
- Switching back to "Default" and burning again renders in Noto Sans.

## Out of scope

- Live preview / `LiveSubtitleOverlay` / `CuePreview` using the custom font (they render in the browser via CSS, not via libass). That's a separate task — this plan only fixes the burned output.
- Per-cue font overrides, font weight/italic controls, font subsetting.
