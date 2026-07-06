import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Load ffmpeg-core from unpkg via blob URLs so Vite never tries to transform
// ffmpeg-core.js. Important: the @ffmpeg/ffmpeg worker is a module worker;
// after importScripts() fails it dynamically imports coreURL and expects a
// default export, so this must be the ESM build, not the UMD build.
const CORE_VERSION = "0.12.6";
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegPromise: Promise<FFmpeg> | null = null;
let logListener: ((msg: string) => void) | null = null;

export function onFfmpegLog(cb: (msg: string) => void) {
  logListener = cb;
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      logListener?.(message);
    });
    try {
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    } catch (error) {
      ffmpeg.terminate();
      ffmpegPromise = null;
      throw error;
    }
  })();
  return ffmpegPromise;
}

export type ProgressCb = (ratio: number) => void;

export function onProgress(ffmpeg: FFmpeg, cb: ProgressCb) {
  const handler = ({ progress }: { progress: number }) => {
    cb(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on("progress", handler);
  return () => ffmpeg.off("progress", handler);
}
