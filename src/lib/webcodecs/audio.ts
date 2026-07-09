/**
 * Fast audio extraction path using Web Audio API + lamejs.
 *
 * - Decodes the container's audio track via `decodeAudioData` (browser-native,
 *   hardware-accelerated when available).
 * - Downmixes to mono, resamples to 16 kHz via OfflineAudioContext.
 * - Encodes to MP3 with @breezystack/lamejs (a maintained fork, pure JS).
 *
 * Typically 3–10× faster than the ffmpeg.wasm path on the same clip, with
 * no WASM instantiation cost.
 *
 * Throws on containers Web Audio can't decode (e.g. some MPEG-TS blobs);
 * callers should fall back to `extractAudioMp3` from ffmpeg/operations.
 */
import lamejs from "@breezystack/lamejs";

const TARGET_SR = 16000;

async function decodeToBuffer(blob: Blob): Promise<AudioBuffer> {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    try {
      await ctx.close();
    } catch {
      // ignore
    }
  }
}

async function resampleMono(input: AudioBuffer, sampleRate: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(input.duration * sampleRate));
  const off = new OfflineAudioContext(1, length, sampleRate);
  const src = off.createBufferSource();
  src.buffer = input;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  // OfflineAudioContext output is Float32 in [-1, 1] on ch 0.
  return rendered.getChannelData(0).slice();
}

function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeMp3(samples: Int16Array, sampleRate: number, kbps = 64): Uint8Array {
  // Mono, kbps VBR-ish (lamejs implements a light CBR mode)
  const enc = new lamejs.Mp3Encoder(1, sampleRate, kbps);
  const chunkSize = 1152; // classic MP3 frame size
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, Math.min(samples.length, i + chunkSize));
    const buf = enc.encodeBuffer(chunk) as Uint8Array;
    if (buf.length > 0) chunks.push(buf);
  }
  const tail = enc.flush() as Uint8Array;
  if (tail.length > 0) chunks.push(tail);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export async function extractAudioMp3Fast(
  file: File | Blob,
  onP?: (ratio: number) => void,
): Promise<Uint8Array> {
  onP?.(0.05);
  const decoded = await decodeToBuffer(file);
  onP?.(0.45);
  const mono = await resampleMono(decoded, TARGET_SR);
  onP?.(0.75);
  const int16 = floatToInt16(mono);
  const mp3 = encodeMp3(int16, TARGET_SR, 64);
  onP?.(1);
  if (mp3.length < 512) throw new Error("Fast audio extraction produced empty output");
  return mp3;
}
