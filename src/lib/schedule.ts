// Chamber TV recording schedule: Tuesday–Thursday 14:00–18:00 Europe/Luxembourg.
// All logic uses the Luxembourg wall clock via Intl.DateTimeFormat.

const TZ = "Europe/Luxembourg";

export const SCHEDULE = {
  weekdays: [2, 3, 4] as const, // Tue, Wed, Thu (JS getDay)
  startHour: 14,
  endHour: 18,
} as const;

/** Wall-clock parts (year/month/day/hour/min/sec/weekday) in Luxembourg time. */
function luxParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday as string] ?? 0,
  };
}

export interface SessionWindow {
  /** UTC Date the session starts. */
  start: Date;
  /** UTC Date the session ends. */
  end: Date;
  /** ISO local date for this session (session_date column). */
  sessionDate: string;
}

/**
 * Convert a Luxembourg local date + hour into a UTC Date by binary-searching
 * offsets. Handles DST transitions safely.
 */
function luxLocalToUtc(y: number, m: number, d: number, hour: number): Date {
  // Assume offset is +1 or +2. Try both and pick the one whose lux parts match.
  for (const offset of [1, 2]) {
    const utc = new Date(Date.UTC(y, m - 1, d, hour - offset, 0, 0));
    const p = luxParts(utc);
    if (p.year === y && p.month === m && p.day === d && p.hour === hour) return utc;
  }
  // Fallback (shouldn't happen)
  return new Date(Date.UTC(y, m - 1, d, hour - 1, 0, 0));
}

function isoDate(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

/** The next (or current) scheduled recording window, based on `now`. */
export function nextSessionWindow(now: Date = new Date()): SessionWindow {
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86400_000);
    const p = luxParts(probe);
    if (!SCHEDULE.weekdays.includes(p.weekday as 2 | 3 | 4)) continue;
    const start = luxLocalToUtc(p.year, p.month, p.day, SCHEDULE.startHour);
    const end = luxLocalToUtc(p.year, p.month, p.day, SCHEDULE.endHour);
    // If today's window has already ended, skip.
    if (end.getTime() <= now.getTime()) continue;
    return { start, end, sessionDate: isoDate(p.year, p.month, p.day) };
  }
  // Fallback: 1 year out
  const p = luxParts(now);
  return {
    start: luxLocalToUtc(p.year, p.month, p.day, SCHEDULE.startHour),
    end: luxLocalToUtc(p.year, p.month, p.day, SCHEDULE.endHour),
    sessionDate: isoDate(p.year, p.month, p.day),
  };
}

/** True when `now` falls inside the next/current session window. */
export function isInSession(now: Date = new Date()): SessionWindow | null {
  const w = nextSessionWindow(now);
  if (now >= w.start && now < w.end) return w;
  return null;
}

export function formatLuxTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDurationMs(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
