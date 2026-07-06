import type { SrtCue } from "./luxasrToSrt";

// Split text into sentences by punctuation, keeping delimiters.
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g);
  if (!parts) return [text.trim()].filter(Boolean);
  return parts.map((s) => s.trim()).filter(Boolean);
}

// Chunk into groups of up to `maxSentences` sentences and split cues
// proportionally by character length.
export function shortenCues(
  cues: SrtCue[],
  opts: { maxSentences?: number; maxChars?: number } = {},
): SrtCue[] {
  const maxSentences = opts.maxSentences ?? 2;
  const maxChars = opts.maxChars ?? 90;
  const out: SrtCue[] = [];
  let idx = 1;

  for (const cue of cues) {
    const dur = Math.max(0.1, cue.end - cue.start);
    const sentences = splitSentences(cue.text);

    // Group sentences: up to maxSentences AND respecting maxChars total length.
    const groups: string[] = [];
    let current = "";
    let count = 0;
    for (const s of sentences) {
      const wouldOverflow =
        (current.length + (current ? 1 : 0) + s.length > maxChars && current) ||
        count >= maxSentences;
      if (wouldOverflow) {
        groups.push(current);
        current = s;
        count = 1;
      } else {
        current = current ? `${current} ${s}` : s;
        count += 1;
      }
    }
    if (current) groups.push(current);
    if (groups.length === 0) continue;

    const totalChars = groups.reduce((n, g) => n + g.length, 0) || 1;
    let cursor = cue.start;
    groups.forEach((g, i) => {
      const share = i === groups.length - 1
        ? cue.end - cursor
        : (g.length / totalChars) * dur;
      const start = cursor;
      const end = i === groups.length - 1 ? cue.end : Math.min(cue.end, cursor + share);
      out.push({ index: idx++, start, end, text: g });
      cursor = end;
    });
  }
  return out;
}
