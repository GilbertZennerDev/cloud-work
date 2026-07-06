import { toSrtTimestamp } from "./parseTime";

// LuxASR JSON segment shape (subset). Different LuxASR outputs vary; we accept both
// segment-level and word-level structures.
export interface LuxSegment {
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; word: string }[];
}

export interface LuxAsrJson {
  segments?: LuxSegment[];
  // Some responses nest under `result` or return an array directly.
  result?: { segments?: LuxSegment[] } | LuxSegment[];
}

export interface SrtCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

function extractSegments(json: unknown): LuxSegment[] {
  if (!json) return [];
  if (Array.isArray(json)) return json as LuxSegment[];
  const j = json as LuxAsrJson;
  if (Array.isArray(j.segments)) return j.segments;
  if (Array.isArray(j.result)) return j.result;
  if (j.result && typeof j.result === "object" && Array.isArray(j.result.segments)) {
    return j.result.segments;
  }
  return [];
}

export function luxasrJsonToCues(json: unknown): SrtCue[] {
  const segs = extractSegments(json);
  return segs
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s, i) => ({
      index: i + 1,
      start: Number(s.start) || 0,
      end: Number(s.end) || Number(s.start) || 0,
      text: s.text.trim(),
    }));
}

export function cuesToSrt(cues: SrtCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${toSrtTimestamp(c.start)} --> ${toSrtTimestamp(c.end)}\n${c.text}\n`,
    )
    .join("\n");
}
