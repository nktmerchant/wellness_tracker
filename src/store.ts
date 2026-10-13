/**
 * The on-device copy of every day's log. The UI only ever reads and writes
 * here, so it works offline and never waits on the network; sync.ts moves
 * records between this store and Supabase in the background.
 *
 * Records keep the original `triangle-log:<date>` keys and shape, with two
 * extra fields, so data logged before sync existed is read unchanged:
 *   updatedAt  ms timestamp of the last edit, used for last-write-wins
 *   dirty      edited here and not yet confirmed by the server
 */
import type { DayLog } from './useDayLog';

export type StoredDay = DayLog & { updatedAt: number; dirty: boolean };

const PREFIX = 'triangle-log:';
const keyFor = (date: string) => `${PREFIX}${date}`;

const BLANK: DayLog = { activities: [], meals: [], sleepHours: null };

const isBlank = (log: DayLog) =>
  log.activities.length === 0 && log.meals.length === 0 && log.sleepHours === null;

/*
 * localStorage throws in private windows and when site data is blocked, and
 * can hold anything a previous version wrote, so both directions are guarded
 * and a bad read falls back to nothing rather than breaking the render.
 */
export function readStored(date: string): StoredDay | null {
  try {
    const raw = localStorage.getItem(keyFor(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDay>;
    const log: DayLog = {
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      meals: Array.isArray(parsed.meals) ? parsed.meals : [],
      sleepHours: typeof parsed.sleepHours === 'number' ? parsed.sleepHours : null,
    };
    /*
     * A record from before sync has no updatedAt. If it holds anything it
     * still needs uploading, so it counts as dirty — at time 0, so any copy
     * already on the server wins over it.
     */
    const legacy = typeof parsed.updatedAt !== 'number';
    return {
      ...log,
      updatedAt: legacy ? 0 : parsed.updatedAt!,
      dirty: legacy ? !isBlank(log) : parsed.dirty === true,
    };
  } catch {
    return null;
  }
}

export function readDay(date: string): DayLog {
  const s = readStored(date);
  return s ? { activities: s.activities, meals: s.meals, sleepHours: s.sleepHours } : BLANK;
}

function put(date: string, day: StoredDay): void {
  try {
    localStorage.setItem(keyFor(date), JSON.stringify(day));
  } catch {
    /* nothing useful to do: the log stays in memory for this session */
  }
}

/**
 * A local edit: stamped now and queued for upload. The stamp always moves
 * forward, even within one millisecond or if the clock steps back, because
 * sync uses it to tell whether a record changed while it was being uploaded.
 */
export function writeDay(date: string, log: DayLog): void {
  const prev = readStored(date)?.updatedAt ?? 0;
  put(date, { ...log, updatedAt: Math.max(Date.now(), prev + 1), dirty: true });
  emit();
}

/** A record that came from, or was confirmed by, the server. */
export function writeSynced(date: string, log: DayLog, updatedAt: number): void {
  put(date, { ...log, updatedAt, dirty: false });
}

/** Every date that has a local record, for sync to scan. */
export function storedDates(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
  } catch {
    /* storage unavailable: nothing to scan */
  }
  return out;
}

/* ---- change notification, for useSyncExternalStore ---- */

/*
 * A counter rather than a snapshot of the data: components re-read the days
 * they show when it moves. It changes on local edits and when a sync pulls
 * something new, which is how a write from another device reaches the screen.
 */
let version = 0;
const listeners = new Set<() => void>();

export function emit(): void {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const getVersion = () => version;
