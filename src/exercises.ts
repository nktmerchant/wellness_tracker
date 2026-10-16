/**
 * Every exercise a person can track, and which of them (up to eight) they
 * have picked over time: a dated setting, kept as picks.ts describes.
 */
import type { Slot } from './geometry';
import { createPicks } from './picks';

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

const picks = createPicks({ catalog: CATALOG, defaults: DEFAULT_EXERCISES, max: MAX_EXERCISES });

export const exerciseById = picks.byId;
export const useExerciseHistory = picks.useHistory;
export const useTodaysExercises = picks.useToday;
export const setExercises = picks.set;
export const applyServerExercises = picks.applyServer;
export const onExercisesEdit = picks.onEdit;
export const exerciseHistory = picks.history;
/** A day's exercises: what was picked that day, then any others it logged. */
export const exercisesOn = picks.on;
