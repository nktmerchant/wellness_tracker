/**
 * A dated history of which slots a person has picked from a catalog. Both
 * the exercises and the meals are kept this way: a setting saved with the
 * account (sync.ts), so every device shows the same figure.
 *
 * Changing the picks changes the figure from that day on. Earlier days keep
 * what they had, and trends and sharing look names and icons up in the
 * catalog, so history never loses one.
 */
import { useSyncExternalStore } from 'react';
import type { Slot } from './geometry';
import { todayISO } from './useDayLog';

/**
 * Each version holds from its date until the next one; before the first,
 * the defaults. So each day shows what was picked on that day: a slot turned
 * off later still appears (and can still be changed) on the days it was in
 * use.
 */
export type Version = { from: string; ids: string[] };

export function createPicks<T extends Slot>({
  catalog,
  defaults,
  max,
}: {
  /** Canonical order: everything that lists picks lists them in it. */
  catalog: T[];
  defaults: string[];
  max: number;
}) {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const rank = new Map(catalog.map((s, i) => [s.id, i]));

  /**
   * A saved list made safe to use: known ids only, no repeats, at most
   * `max`, in catalog order, and never empty, since a node with nothing to
   * tap is no use. Anything else (a missing or mangled setting) falls back
   * to the defaults.
   */
  function clean(ids: unknown): string[] {
    if (!Array.isArray(ids)) return defaults;
    const out = [...new Set(ids.filter((x): x is string => typeof x === 'string' && byId.has(x)))];
    out.sort((a, b) => rank.get(a)! - rank.get(b)!);
    return out.length ? out.slice(0, max) : defaults;
  }

  /** A saved history made safe to use: dated entries only, oldest first. */
  function cleanHistory(raw: unknown): Version[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is { from: string; ids: unknown } => typeof v?.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.from))
      .map((v) => ({ from: v.from, ids: clean(v.ids) }))
      .sort((x, y) => (x.from < y.from ? -1 : 1));
  }

  let history: Version[] = [];
  const listeners = new Set<() => void>();
  const editListeners = new Set<() => void>();

  const getHistory = () => history;

  function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  }

  function apply(next: Version[]): void {
    history = next;
    listeners.forEach((l) => l());
  }

  /** The ids picked on a date (ISO, so dates compare as strings). */
  function idsOn(h: Version[], date: string): string[] {
    let ids = defaults;
    for (const v of h) if (v.from <= date) ids = v.ids;
    return ids;
  }

  /** The whole history; re-renders on any change to it. */
  const useHistory = () => useSyncExternalStore(subscribe, getHistory);

  return {
    byId: (id: string): T | undefined => byId.get(id),
    clean,
    idsOn,
    useHistory,

    /** Today's picks, which are what settings shows and edits. */
    useToday: () => idsOn(useHistory(), todayISO()),

    /**
     * An edit from settings: it takes effect from today, leaving earlier
     * days as they were. Shown at once, then saved by sync.ts. A day's
     * repeated edits replace one another, and one that lands back on the
     * previous picks drops out, so the history only grows by real changes.
     */
    set(ids: string[]): void {
      const today = todayISO();
      const before = history.filter((v) => v.from < today);
      const next = clean(ids);
      const same = idsOn(before, today).join() === next.join();
      apply(same ? before : [...before, { from: today, ids: next }]);
      editListeners.forEach((l) => l());
    },

    /** The setting as loaded from the account. */
    applyServer: (raw: unknown) => apply(cleanHistory(raw)),

    onEdit(l: () => void): () => void {
      editListeners.add(l);
      return () => editListeners.delete(l);
    },

    history: getHistory,

    /**
     * A day's slots: what was picked that day, then any others it logged.
     * Those can only come from editing the picks after logging the same day,
     * and they keep the entry visible rather than hidden.
     */
    on(h: Version[], date: string, logged: string[]): T[] {
      const picked = idsOn(h, date);
      const done = new Set(logged.map((a) => a.replace(/:half$/, '')));
      const extra = catalog.filter((s) => done.has(s.id) && !picked.includes(s.id));
      return [...picked.map((id) => byId.get(id)!), ...extra];
    },
  };
}
