/**
 * Background sync between the on-device store and Supabase.
 *
 * Local-first: every edit lands in store.ts immediately, and this module
 * reconciles in the background — after edits, on launch, when the app comes
 * back to the foreground and when the network returns. Without Supabase
 * configured (no VITE_SUPABASE_* at build time) it does nothing and the app
 * is local-only.
 *
 * Conflicts are last-write-wins per day, by edit time. One person on a couple
 * of devices rarely edits the same day on both while offline, and when they
 * do the newer edit is the one they meant.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emit, readStored, storedDates, subscribe, writeSynced } from './store';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;

type Row = {
  day: string;
  activities: string[];
  meals: string[];
  sleep_hours: number | null;
  updated_at: string;
};

/* ---- status, for the account UI ---- */

export type SyncStatus = {
  /** False when the build has no Supabase settings: local-only mode. */
  configured: boolean;
  email: string | null;
  state: 'idle' | 'syncing' | 'error' | 'offline';
  /** Days edited here that the server has not confirmed yet. */
  pending: number;
  lastSynced: number | null;
  error: string | null;
};

let status: SyncStatus = {
  configured: supabase !== null,
  email: null,
  state: 'idle',
  pending: 0,
  lastSynced: null,
  error: null,
};
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}

export const getStatus = () => status;
export function subscribeStatus(l: () => void): () => void {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}

const dirtyDates = () => storedDates().filter((d) => readStored(d)?.dirty);

/* ---- the sync pass ---- */

let running = false;
let again = false;
/** Set while a pull's changes are announced, so they don't read as edits. */
let applyingRemote = false;

/**
 * Pull, then push. Pulling first means a newer edit from another device
 * replaces a stale local one before it can be uploaded over the top.
 * Overlapping calls collapse into one follow-up pass.
 */
export async function sync(): Promise<void> {
  if (!supabase || !status.email) return;
  if (!navigator.onLine) {
    setStatus({ state: 'offline', pending: dirtyDates().length });
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  setStatus({ state: 'syncing', error: null });
  try {
    if (await pull()) {
      applyingRemote = true;
      emit();
      applyingRemote = false;
    }
    await push();
    setStatus({ state: 'idle', lastSynced: Date.now() });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    setStatus({ pending: dirtyDates().length });
    if (again) {
      again = false;
      void sync();
    }
  }
}

/** Returns whether anything local changed. */
async function pull(): Promise<boolean> {
  let changed = false;
  /* PostgREST caps a response at 1000 rows by default, so page through. */
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from('day_logs')
      .select('day, activities, meals, sleep_hours, updated_at')
      .order('day')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data as Row[]) {
      const remoteAt = Date.parse(row.updated_at);
      const local = readStored(row.day);
      if (local && local.updatedAt >= remoteAt) continue;
      writeSynced(
        row.day,
        { activities: row.activities, meals: row.meals, sleepHours: row.sleep_hours },
        remoteAt,
      );
      changed = true;
    }
    if (data.length < PAGE) return changed;
  }
}

async function push(): Promise<void> {
  const dates = dirtyDates();
  if (dates.length === 0) return;
  const sent = dates.map((day) => {
    const s = readStored(day)!;
    return { day, stamp: s.updatedAt, row: toRow(day, s) };
  });
  const { error } = await supabase!
    .from('day_logs')
    .upsert(sent.map((s) => s.row), { onConflict: 'user_id,day' });
  if (error) throw error;
  /*
   * Only clear the flag if the record is still the one that was sent: an
   * edit made while the request was in flight must stay queued.
   */
  for (const { day, stamp } of sent) {
    const now = readStored(day);
    if (now && now.updatedAt === stamp) writeSynced(day, now, stamp);
  }
}

function toRow(day: string, s: NonNullable<ReturnType<typeof readStored>>): Row {
  return {
    day,
    activities: s.activities,
    meals: s.meals,
    sleep_hours: s.sleepHours,
    /* A legacy record has no edit time; upload it as "the epoch" so it never
       outranks anything another device wrote. */
    updated_at: new Date(s.updatedAt).toISOString(),
  };
}

/* ---- sign-in: email and password ---- */

/*
 * No sign-up here: the one account is created in the Supabase dashboard and
 * new sign-ups are turned off, so nothing in the app can create users.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase!.auth.signOut();
}

/* ---- wiring ---- */

let debounce: ReturnType<typeof setTimeout> | undefined;

export function startSync(): void {
  if (!supabase) return;

  supabase.auth.onAuthStateChange((_event, session) => {
    const email = session?.user.email ?? null;
    if (email === status.email) return;
    setStatus({ email, pending: dirtyDates().length });
    if (email) void sync();
  });

  /* Local edits: wait for a pause, so a dial drag uploads once, not per step. */
  subscribe(() => {
    if (applyingRemote) return;
    setStatus({ pending: dirtyDates().length });
    clearTimeout(debounce);
    debounce = setTimeout(() => void sync(), 1500);
  });

  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
}
