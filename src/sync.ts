/**
 * Supabase is where the log lives. This module signs in, loads the signed-in
 * user's days into the in-memory store, and saves edits back.
 *
 * Edits show on screen immediately and are saved after a short pause, so a
 * dial drag is one request rather than one per step. A day with an unsaved
 * edit is never overwritten by a reload, so a slow save can't be undone by a
 * refresh that raced it. While the app is open, a Realtime subscription
 * brings in edits from the user's other devices as they're saved; reloading
 * on return to the foreground covers anything missed while the connection
 * was down. The exercise and meal picks are settings on the account itself (its
 * user metadata), saved alongside the days and read on every load. The app
 * needs the network: there is no copy on the
 * device, and a failed save is shown and retried, not queued for later.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { applyServerExercises, exerciseHistory, onExercisesEdit } from './exercises';
import { applyServerMeals, mealHistory, onMealsEdit } from './meals';
import { applyServer, applyServerDay, clearDays, onEdit, readDay } from './store';
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
  /** Days (and the picks settings) edited on screen that the server
      hasn't confirmed yet. */
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
    const [rows, user] = await Promise.all([fetchAll(), supabase!.auth.getUser()]);
    if (uid !== userId) return; // signed out or switched while loading
    applyServer(rows, new Set(pending.keys()));
    /* Picks changed on another device arrive here; an unsaved edit wins. */
    if (!settingsEdits && user.data.user) applyServerPicks(user.data.user.user_metadata);
    if (blocking) setStatus({ load: 'ready' });
  } catch (e) {
    if (blocking && uid === userId) setStatus({ load: 'error', loadError: message(e) });
  }
}

/* ---- saving ---- */

/** Unsaved days, each with a count of edits so far. */
const pending = new Map<string, number>();
/** Unsaved edits to the exercise and meal picks, counted the same way. */
let settingsEdits = 0;

const unsaved = () => pending.size + (settingsEdits ? 1 : 0);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false;
let saveAgain = false;

function queueSave(date: string) {
  pending.set(date, (pending.get(date) ?? 0) + 1);
  scheduleSave();
}

function queueSettingsSave() {
  settingsEdits++;
  scheduleSave();
}

function scheduleSave() {
  setStatus({ pending: unsaved(), save: status.save === 'error' ? 'error' : 'saving' });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 800);
}

/**
 * Saves every pending day in one request, and the picks in another
 * if they changed. Overlapping calls collapse.
 */
export async function save(): Promise<void> {
  clearTimeout(saveTimer);
  if (!supabase || unsaved() === 0) return;
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
  const settingsSent = settingsEdits;
  setStatus({ save: 'saving' });
  try {
    if (sent.length) {
      const { error } = await supabase
        .from('day_logs')
        .upsert(sent.map((s) => s.row), { onConflict: 'user_id,day' });
      if (error) throw error;
    }
    if (settingsSent) {
      /* `exercises` was a single list, from before picks were dated. */
      const { error } = await supabase.auth.updateUser({
        data: { exerciseHistory: exerciseHistory(), mealHistory: mealHistory(), exercises: null },
      });
      if (error) throw error;
    }
    if (uid !== userId) return;
    /* Anything edited again while the request was in flight stays pending. */
    for (const { day, edits } of sent) {
      if (pending.get(day) === edits) pending.delete(day);
    }
    if (settingsEdits === settingsSent) settingsEdits = 0;
    setStatus({ save: 'saved', saveError: null, pending: unsaved() });
  } catch (e) {
    if (uid === userId) setStatus({ save: 'error', saveError: message(e) });
  } finally {
    saving = false;
    if (saveAgain || (unsaved() > 0 && status.save !== 'error')) {
      saveAgain = false;
      void save();
    }
  }
}

/* ---- live updates ---- */

let channel: RealtimeChannel | null = null;

/**
 * Every saved change to this user's rows, from any device — including this
 * one's own saves, which come back with the values already on screen. A day
 * with an unsaved edit here keeps the edit; it will be saved over the top.
 */
function listen(uid: string): void {
  channel = supabase!
    .channel(`day_logs:${uid}`)
    .on<Row>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'day_logs', filter: `user_id=eq.${uid}` },
      (payload) => {
        if (uid !== userId || payload.eventType === 'DELETE') return;
        const row = payload.new;
        if (pending.has(row.day)) return;
        applyServerDay(row.day, {
          activities: row.activities,
          meals: row.meals,
          sleepHours: row.sleep_hours,
        });
      },
    )
    .subscribe((state) => {
      /* A rejoin after a dropped connection may have missed changes. The
         first join doesn't need this: the initial load is already running. */
      if (state === 'SUBSCRIBED' && status.load === 'ready') void load();
    });
}

function unsubscribe(): void {
  if (channel) void supabase!.removeChannel(channel);
  channel = null;
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

/** The saved picks from the account's metadata; missing ones fall back to the defaults. */
function applyServerPicks(meta: Record<string, unknown> | undefined): void {
  applyServerExercises(meta?.exerciseHistory);
  applyServerMeals(meta?.mealHistory);
}

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
    unsubscribe();
    clearTimeout(saveTimer);
    pending.clear();
    settingsEdits = 0;
    clearDays();
    /* The saved picks ride along with the session; signed out, the defaults. */
    applyServerPicks(session?.user.user_metadata);
    setStatus({
      auth: uid ? 'signed-in' : 'signed-out',
      email: session?.user.email ?? null,
      load: 'loading',
      loadError: null,
      save: 'saved',
      saveError: null,
      pending: 0,
    });
    if (uid) {
      setTimeout(() => {
        if (uid !== userId) return;
        void load();
        listen(uid);
      }, 0);
    }
  });

  onEdit(queueSave);
  onExercisesEdit(queueSettingsSave);
  onMealsEdit(queueSettingsSave);

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
    if (unsaved() > 0) e.preventDefault();
  });
}
