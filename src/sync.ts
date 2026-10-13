/**
 * Supabase is where the log lives. This module signs in, loads the signed-in
 * user's days into the in-memory store, and saves edits back.
 *
 * Edits show on screen immediately and are saved after a short pause, so a
 * dial drag is one request rather than one per step. A day with an unsaved
 * edit is never overwritten by a reload, so a slow save can't be undone by a
 * refresh that raced it. The app needs the network: there is no copy on the
 * device, and a failed save is shown and retried, not queued for later.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyServer, clearDays, onEdit, readDay } from './store';
import type { DayLog } from './useDayLog';

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

/* ---- status, for the sign-in gate and the account chip ---- */

export type Status = {
  /** False when the build has no Supabase settings; the app can't run. */
  configured: boolean;
  auth: 'checking' | 'signed-out' | 'signed-in';
  email: string | null;
  /** The first load after sign-in; the app is shown once it's 'ready'. */
  load: 'loading' | 'ready' | 'error';
  loadError: string | null;
  save: 'saved' | 'saving' | 'error';
  saveError: string | null;
  /** Days edited on screen that the server hasn't confirmed yet. */
  pending: number;
};

let status: Status = {
  configured: supabase !== null,
  auth: 'checking',
  email: null,
  load: 'loading',
  loadError: null,
  save: 'saved',
  saveError: null,
  pending: 0,
};
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}

export const getStatus = () => status;
export function subscribeStatus(l: () => void): () => void {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---- loading ---- */

async function fetchAll(): Promise<Map<string, DayLog>> {
  const out = new Map<string, DayLog>();
  /* PostgREST caps a response at 1000 rows by default, so page through. */
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from('day_logs')
      .select('day, activities, meals, sleep_hours')
      .order('day')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data as Row[]) {
      out.set(row.day, {
        activities: row.activities,
        meals: row.meals,
        sleepHours: row.sleep_hours,
      });
    }
    if (data.length < PAGE) return out;
  }
}

/**
 * The first load blocks the app behind a loading screen; later reloads (when
 * the app comes back to the foreground) happen behind the scenes, and a
 * failure there just leaves what's on screen.
 */
export async function load(): Promise<void> {
  const blocking = status.load !== 'ready';
  const uid = userId;
  if (blocking) setStatus({ load: 'loading', loadError: null });
  try {
    const rows = await fetchAll();
    if (uid !== userId) return; // signed out or switched while loading
    applyServer(rows, new Set(pending.keys()));
    if (blocking) setStatus({ load: 'ready' });
  } catch (e) {
    if (blocking && uid === userId) setStatus({ load: 'error', loadError: message(e) });
  }
}

/* ---- saving ---- */

/** Unsaved days, each with a count of edits so far. */
const pending = new Map<string, number>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false;
let saveAgain = false;

function queueSave(date: string) {
  pending.set(date, (pending.get(date) ?? 0) + 1);
  setStatus({ pending: pending.size, save: status.save === 'error' ? 'error' : 'saving' });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 800);
}

/** Saves every pending day in one request. Overlapping calls collapse. */
export async function save(): Promise<void> {
  clearTimeout(saveTimer);
  if (!supabase || pending.size === 0) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  const uid = userId;
  const sent = [...pending].map(([day, edits]) => {
    const log = readDay(day);
    const row: Row = {
      day,
      activities: log.activities,
      meals: log.meals,
      sleep_hours: log.sleepHours,
      updated_at: new Date().toISOString(),
    };
    return { day, edits, row };
  });
  setStatus({ save: 'saving' });
  try {
    const { error } = await supabase
      .from('day_logs')
      .upsert(sent.map((s) => s.row), { onConflict: 'user_id,day' });
    if (error) throw error;
    if (uid !== userId) return;
    /* A day edited again while the request was in flight stays pending. */
    for (const { day, edits } of sent) {
      if (pending.get(day) === edits) pending.delete(day);
    }
    setStatus({ save: 'saved', saveError: null, pending: pending.size });
  } catch (e) {
    if (uid === userId) setStatus({ save: 'error', saveError: message(e) });
  } finally {
    saving = false;
    if (saveAgain || (pending.size > 0 && status.save !== 'error')) {
      saveAgain = false;
      void save();
    }
  }
}

/* ---- sign-in: email and password ---- */

/*
 * No sign-up here: accounts are created in the Supabase dashboard and new
 * sign-ups are turned off, so nothing in the app can create users.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase!.auth.signOut();
}

/* ---- wiring ---- */

let userId: string | null = null;

export function startSync(): void {
  if (!supabase) return;

  /*
   * Fires once at start with the saved session (or none), then on sign-in and
   * sign-out. Token refreshes keep the same user and are ignored. Work is
   * deferred out of the callback: awaiting Supabase calls inside it can
   * deadlock on the auth lock.
   */
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null;
    if (uid === userId && status.auth !== 'checking') return;
    userId = uid;
    clearTimeout(saveTimer);
    pending.clear();
    clearDays();
    setStatus({
      auth: uid ? 'signed-in' : 'signed-out',
      email: session?.user.email ?? null,
      load: 'loading',
      loadError: null,
      save: 'saved',
      saveError: null,
      pending: 0,
    });
    if (uid) setTimeout(() => void load(), 0);
  });

  onEdit(queueSave);

  const retry = () => {
    if (status.auth !== 'signed-in') return;
    if (status.load === 'ready') void load();
    void save();
  };
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', () => {
    /* Leaving the app: save now rather than after the pause. */
    if (document.visibilityState === 'hidden') void save();
    else retry();
  });
  window.addEventListener('beforeunload', (e) => {
    if (pending.size > 0) e.preventDefault();
  });
}
