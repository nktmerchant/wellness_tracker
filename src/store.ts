/**
 * The signed-in user's log, held in memory for the screens to read. Supabase
 * is the only lasting copy: sync.ts fills this from the server after sign-in
 * and saves edits back. Nothing here is written to the device.
 */
import type { DayLog } from './useDayLog';

const BLANK: DayLog = { activities: [], meals: [], sleepHours: null };

const days = new Map<string, DayLog>();

export function readDay(date: string): DayLog {
  return days.get(date) ?? BLANK;
}

/** Edit listeners, so sync.ts can queue the save without the UI knowing. */
const editListeners = new Set<(date: string) => void>();

export function onEdit(l: (date: string) => void): () => void {
  editListeners.add(l);
  return () => editListeners.delete(l);
}

/** An edit from the UI: shown at once, then saved by sync.ts. */
export function writeDay(date: string, log: DayLog): void {
  days.set(date, log);
  emit();
  editListeners.forEach((l) => l(date));
}

/** Days loaded from the server. `keep` are dates with unsaved local edits. */
export function applyServer(rows: Map<string, DayLog>, keep: Set<string>): void {
  for (const date of [...days.keys()]) {
    if (!keep.has(date) && !rows.has(date)) days.delete(date);
  }
  for (const [date, log] of rows) {
    if (!keep.has(date)) days.set(date, log);
  }
  emit();
}

export function clearDays(): void {
  days.clear();
  emit();
}

/* ---- change notification, for useSyncExternalStore ---- */

/*
 * A counter rather than a snapshot of the data: components re-read the days
 * they show when it moves. It changes on edits and whenever a load from the
 * server brings something new.
 */
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const getVersion = () => version;
