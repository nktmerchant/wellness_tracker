/**
 * Every exercise a person can track, and which of them (up to eight) they
 * have picked over time. The picks are a setting saved with the account
 * (sync.ts), so every device shows the same figure.
 *
 * Turning an exercise off changes the ring from that day on. Earlier days
 * keep the ring they had, and trends and sharing look names and icons up
 * here, so history never loses one.
 */
import { useSyncExternalStore } from 'react';
import type { Slot } from './geometry';
import { todayISO } from './useDayLog';

export const GROUPS = ['Cardio', 'Outdoors', 'Gym & studio', 'Sports'] as const;

/** A slot, plus the emoji it is shared as and where settings lists it. */
export type Exercise = Slot & { emoji: string; group: (typeof GROUPS)[number] };

/*
 * Ids are stored in day logs, so an existing id never changes. The order
 * here is canonical: the ring, trends and sharing all list exercises in it.
 */
export const CATALOG: Exercise[] = [
  { id: 'run', label: 'Run', icon: 'run', emoji: '🏃', group: 'Cardio' },
  { id: 'bike', label: 'Bike', icon: 'bike', emoji: '🚴', group: 'Cardio' },
  { id: 'swim', label: 'Swim', icon: 'swim', emoji: '🏊', group: 'Cardio' },
  { id: 'walk', label: 'Walk', icon: 'walk', emoji: '🚶', group: 'Cardio' },
  { id: 'row', label: 'Row', icon: 'row', emoji: '🚣', group: 'Cardio' },

  { id: 'ski', label: 'Ski', icon: 'ski', emoji: '⛷️', group: 'Outdoors' },
  { id: 'snowboard', label: 'Snowboard', icon: 'snowboard', emoji: '🏂', group: 'Outdoors' },
  { id: 'surf', label: 'Surf', icon: 'surf', emoji: '🏄', group: 'Outdoors' },
  { id: 'climb', label: 'Climb', icon: 'climb', emoji: '🧗', group: 'Outdoors' },
  { id: 'hike', label: 'Hike', icon: 'hike', emoji: '🥾', group: 'Outdoors' },
  { id: 'mountainBike', label: 'Mountain bike', icon: 'mountainBike', emoji: '🚵', group: 'Outdoors' },
  { id: 'kayak', label: 'Kayak', icon: 'kayak', emoji: '🛶', group: 'Outdoors' },
  { id: 'skate', label: 'Skate', icon: 'skate', emoji: '🛹', group: 'Outdoors' },

  { id: 'strength', label: 'Strength', icon: 'strength', emoji: '🏋️', group: 'Gym & studio' },
  { id: 'core', label: 'Core', icon: 'core', emoji: '🤸', group: 'Gym & studio' },
  { id: 'meditate', label: 'Meditate', icon: 'meditate', emoji: '🧘', group: 'Gym & studio' },
  { id: 'yoga', label: 'Yoga', icon: 'yoga', emoji: '🧘‍♀️', group: 'Gym & studio' },
  { id: 'stretch', label: 'Stretch', icon: 'stretch', emoji: '🙆', group: 'Gym & studio' },

  { id: 'tennis', label: 'Tennis', icon: 'tennis', emoji: '🎾', group: 'Sports' },
  { id: 'basketball', label: 'Basketball', icon: 'basketball', emoji: '🏀', group: 'Sports' },
  { id: 'soccer', label: 'Soccer', icon: 'soccer', emoji: '⚽', group: 'Sports' },
  { id: 'volleyball', label: 'Volleyball', icon: 'volleyball', emoji: '🏐', group: 'Sports' },
  { id: 'golf', label: 'Golf', icon: 'golf', emoji: '🏌️', group: 'Sports' },
  { id: 'hockey', label: 'Hockey', icon: 'hockey', emoji: '🏒', group: 'Sports' },
];

/** The ring around the node has room for eight. */
export const MAX_EXERCISES = 8;

/** The original eight, for anyone who hasn't chosen. */
export const DEFAULT_EXERCISES = ['run', 'bike', 'ski', 'surf', 'climb', 'strength', 'core', 'meditate'];

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
const RANK = new Map(CATALOG.map((e, i) => [e.id, i]));

export const exerciseById = (id: string): Exercise | undefined => BY_ID.get(id);

/**
 * A saved list made safe to use: known ids only, no repeats, at most eight,
 * in catalog order, and never empty, since a node with nothing to tap is no
 * use. Anything else (a missing or mangled setting) falls back to the
 * defaults. Sorting here also puts lists saved in tick order into line.
 */
export function cleanExercises(ids: unknown): string[] {
  if (!Array.isArray(ids)) return DEFAULT_EXERCISES;
  const out = [...new Set(ids.filter((x): x is string => typeof x === 'string' && BY_ID.has(x)))];
  out.sort((a, b) => RANK.get(a)! - RANK.get(b)!);
  return out.length ? out.slice(0, MAX_EXERCISES) : DEFAULT_EXERCISES;
}

/* ---- the picks over time, for useSyncExternalStore ---- */

/**
 * The picks are kept as a dated history, so each day's ring shows what was
 * picked on that day: an exercise turned off later still appears (and can
 * still be changed) on the days it was in use. Each version holds from its
 * date until the next one; before the first, the defaults.
 */
export type Version = { from: string; ids: string[] };

let history: Version[] = [];
const listeners = new Set<() => void>();
const editListeners = new Set<() => void>();

const getHistory = () => history;

function subscribeHistory(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** A saved history made safe to use: dated entries only, oldest first. */
function cleanHistory(raw: unknown): Version[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is { from: string; ids: unknown } => typeof v?.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.from))
    .map((v) => ({ from: v.from, ids: cleanExercises(v.ids) }))
    .sort((x, y) => (x.from < y.from ? -1 : 1));
}

function apply(next: Version[]): void {
  history = next;
  listeners.forEach((l) => l());
}

/** The ids picked on a date (ISO, so dates compare as strings). */
export function idsOn(h: Version[], date: string): string[] {
  let ids = DEFAULT_EXERCISES;
  for (const v of h) if (v.from <= date) ids = v.ids;
  return ids;
}

/** The whole history; re-renders on any change to it. */
export const useExerciseHistory = () => useSyncExternalStore(subscribeHistory, getHistory);

/** Today's picks, which are what settings shows and edits. */
export const useTodaysExercises = () => idsOn(useExerciseHistory(), todayISO());

/**
 * An edit from settings: it takes effect from today, leaving earlier days as
 * they were. Shown at once, then saved by sync.ts. A day's repeated edits
 * replace one another, and one that lands back on the previous picks drops
 * out, so the history only grows by real changes.
 */
export function setExercises(ids: string[]): void {
  const today = todayISO();
  const before = history.filter((v) => v.from < today);
  const next = cleanExercises(ids);
  const same = idsOn(before, today).join() === next.join();
  apply(same ? before : [...before, { from: today, ids: next }]);
  editListeners.forEach((l) => l());
}

/** The setting as loaded from the account. */
export const applyServerExercises = (raw: unknown) => apply(cleanHistory(raw));

export function onExercisesEdit(l: () => void): () => void {
  editListeners.add(l);
  return () => editListeners.delete(l);
}

export const exerciseHistory = () => history;

/**
 * A day's exercises: what was picked that day, then any others it logged. Those can only come from editing the picks after logging the
 * same day, and they keep the entry visible rather than hidden.
 */
export function exercisesOn(h: Version[], date: string, activities: string[]): Exercise[] {
  const picked = idsOn(h, date);
  const logged = new Set(activities.map((a) => a.replace(/:half$/, '')));
  const extra = CATALOG.filter((e) => logged.has(e.id) && !picked.includes(e.id));
  return [...picked.map((id) => BY_ID.get(id)!), ...extra];
}
