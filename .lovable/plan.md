Plan to fix the burned subtitle output:

1. **Reset timestamps before burning**
   - Update the burn-in filter chain so video frames are normalized with `setpts=PTS-STARTPTS` before the subtitle filter runs.
   - Add output timestamp normalization (`-avoid_negative_ts make_zero`) so `clip_subbed` starts at 0 and ASS cues at 0 seconds are actually visible.

2. **Make subtitle rendering fail-safe**
   - Keep the current white text + black outline style, but harden ASS/filter escaping for font names so uploaded fonts cannot break the `subtitles` filter options.
   - If a selected uploaded font is risky or cannot be matched, keep subtitles visible by falling back to the bundled Noto Sans font rather than producing an apparently empty clip.

3. **Fix the selected-cue burn path specifically**
   - Apply the same robust burn settings to `Cut selected`, where cues are remapped to a new 0-based timeline.
   - Preserve per-cue positions and the chosen global subtitle position.

4. **Verify**
   - Run a focused TypeScript check.
   - Inspect the generated ASS/filter arguments and ensure non-empty `Dialogue:` lines are passed into the burn step.
   - Use the Cutter preview path to confirm the app still renders and the burn path no longer silently creates subtitle-less output.