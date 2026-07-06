// Parse SS, MM:SS, or HH:MM:SS (with optional .ms) into seconds.
export function parseTimeToSeconds(input: string): number {
  const s = input.trim();
  if (!s) throw new Error("Empty timestamp");
  const parts = s.split(":");
  if (parts.some((p) => p === "" || isNaN(Number(p)))) {
    throw new Error(`Invalid timestamp: "${input}"`);
  }
  const nums = parts.map(Number);
  let seconds = 0;
  if (nums.length === 1) seconds = nums[0];
  else if (nums.length === 2) seconds = nums[0] * 60 + nums[1];
  else if (nums.length === 3) seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  else throw new Error(`Invalid timestamp: "${input}"`);
  if (seconds < 0 || !isFinite(seconds)) throw new Error(`Invalid timestamp: "${input}"`);
  return seconds;
}

export function formatSeconds(total: number): string {
  const t = Math.max(0, total);
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = Math.floor(t % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function toSrtTimestamp(total: number): string {
  const t = Math.max(0, total);
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = Math.floor(t % 60);
  const ms = Math.floor((t - Math.floor(t)) * 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}
