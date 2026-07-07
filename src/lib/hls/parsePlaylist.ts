// Minimal HLS m3u8 parser: enough to pick a variant from a master and
// extract ordered segment URIs from a media playlist.

export interface Variant {
  url: string;
  bandwidth: number;
  resolution?: string;
  audioGroup?: string;
}

export interface AudioMedia {
  groupId: string;
  name: string;
  url?: string;
  isDefault: boolean;
}

export interface MediaPlaylist {
  segments: string[]; // absolute URLs
  mediaSequence: number;
  targetDuration: number;
  endList: boolean;
}

function resolveUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

export function isMasterPlaylist(text: string): boolean {
  return /#EXT-X-STREAM-INF/i.test(text);
}

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Split on commas that aren't inside quotes.
  const parts = attrs.match(/[A-Z0-9-]+=(?:"[^"]*"|[^,]+)/gi) ?? [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toUpperCase();
    let v = p.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

export function parseMaster(text: string, baseUrl: string): Variant[] {
  const lines = text.split(/\r?\n/);
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const attrs = parseAttrs(line.substring(line.indexOf(":") + 1));
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === "" || lines[j].startsWith("#"))) j++;
      const uri = lines[j]?.trim();
      if (uri) {
        variants.push({
          url: resolveUrl(baseUrl, uri),
          bandwidth: Number(attrs.BANDWIDTH ?? 0) || 0,
          resolution: attrs.RESOLUTION,
          audioGroup: attrs.AUDIO,
        });
      }
    }
  }
  return variants;
}

export function parseAudioMedia(text: string, baseUrl: string): AudioMedia[] {
  const lines = text.split(/\r?\n/);
  const out: AudioMedia[] = [];
  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA")) continue;
    const attrs = parseAttrs(line.substring(line.indexOf(":") + 1));
    if ((attrs.TYPE ?? "").toUpperCase() !== "AUDIO") continue;
    out.push({
      groupId: attrs["GROUP-ID"] ?? "",
      name: attrs.NAME ?? "",
      url: attrs.URI ? resolveUrl(baseUrl, attrs.URI) : undefined,
      isDefault: (attrs.DEFAULT ?? "NO").toUpperCase() === "YES",
    });
  }
  return out;
}


export function parseMedia(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split(/\r?\n/);
  const segments: string[] = [];
  let mediaSequence = 0;
  let targetDuration = 6;
  let endList = false;
  let expectSegment = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
      mediaSequence = Number(line.split(":")[1]) || 0;
    } else if (line.startsWith("#EXT-X-TARGETDURATION")) {
      targetDuration = Number(line.split(":")[1]) || 6;
    } else if (line.startsWith("#EXT-X-ENDLIST")) {
      endList = true;
    } else if (line.startsWith("#EXTINF")) {
      expectSegment = true;
    } else if (!line.startsWith("#") && expectSegment) {
      segments.push(resolveUrl(baseUrl, line));
      expectSegment = false;
    }
  }
  return { segments, mediaSequence, targetDuration, endList };
}
