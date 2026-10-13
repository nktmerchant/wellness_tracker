import { useCallback, useState, useSyncExternalStore } from 'react';
import { getVersion, readDay, subscribe, writeDay } from './store';

/** One day's entries. Activity and meal ids come from the NODES slots. */
export type DayLog = {
  activities: string[];
  meals: string[];
  /**
   * null means not logged yet, which is NOT the same as a logged zero — an
   * empty bar would otherwise read as "slept 0 hours".
   */
  sleepHours: number | null;
};

/** Local calendar date, not UTC — a log entry belongs to the user's own day. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Earliest day the log goes back to. A Monday, so weeks start cleanly. */
export const FIRST_DAY = '2026-10-12';

/** ISO dates compare lexicographically, which is also chronological order. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/* "May" takes no period: it is the one month that is not an abbreviation. */
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
                'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

/** Formatted explicitly rather than by locale, so it never shifts around. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * The Monday of the week containing `iso`. getDay() is Sunday-based, so the
 * shift is (day + 6) % 7 — Sunday belongs to the week that began six days
 * earlier, not the one starting that evening.
 */
export function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return shiftDay(iso, -((dow + 6) % 7));
}

/** The seven dates of the week beginning at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Every date from `from` to `to` inclusive, as ISO strings. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** One day's entries, for callers outside the hook (the trends view). */
export { readDay };

/**
 * Re-renders the caller whenever stored logs change — a local edit or a sync
 * bringing in another device's — so it can re-read the days it shows.
 */
export const useLogVersion = () => useSyncExternalStore(subscribe, getVersion);

/** Compact form for a dense axis, e.g. "Oct. 11". */
export function formatShortDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Today, for callers that need the range's upper bound. */
export const todayISO = today;

export function useDayLog() {
  const [date, setDate] = useState(today);
  useLogVersion();
  /* Read straight from the store each render, so a sync updates it too. */
  const log = readDay(date);

  /* Writes happen only on a real edit, so paging through days never stores
     (or uploads) empty records. */
  const toggle = useCallback(
    (field: 'activities' | 'meals', id: string) => {
      const prev = readDay(date);
      const list = prev[field];
      writeDay(date, {
        ...prev,
        [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      });
    },
    [date],
  );

  const setSleepHours = useCallback(
    (hours: number) => {
      const prev = readDay(date);
      if (prev.sleepHours !== hours) writeDay(date, { ...prev, sleepHours: hours });
    },
    [date],
  );

  /*
   * Today is recomputed on each call rather than captured, so a session left
   * open overnight still knows where "now" is.
   */
  const goDays = useCallback(
    (delta: number) => {
      const next = shiftDay(date, delta);
      if (next < FIRST_DAY || next > today()) return;
      setDate(next);
    },
    [date],
  );

  return {
    date,
    log,
    toggle,
    setSleepHours,
    goDays,
    canGoBack: date > FIRST_DAY,
    canGoForward: date < today(),
  };
}
