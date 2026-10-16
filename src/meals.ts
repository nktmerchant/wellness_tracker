/**
 * The meals a person can track, and which of them they have picked over
 * time: a dated setting, kept as picks.ts describes.
 */
import type { Slot } from './geometry';
import { createPicks } from './picks';

/* Ids are stored in day logs, so an existing id never changes, even when its
   label does. The order here is the order of the day, and of the fan. */
export const MEALS: Slot[] = [
  { id: 'breakfast', label: 'Breakfast', icon: 'breakfast' },
  { id: 'midMorning', label: 'Mid-morning', icon: 'midMorning' },
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'dinner', label: 'Dinner', icon: 'dinner' },
  { id: 'supper', label: 'Snack', icon: 'snack' },
];

const picks = createPicks({ catalog: MEALS, defaults: MEALS.map((m) => m.id), max: MEALS.length });

export const useMealHistory = picks.useHistory;
export const useTodaysMeals = picks.useToday;
export const setMeals = picks.set;
export const applyServerMeals = picks.applyServer;
export const onMealsEdit = picks.onEdit;
export const mealHistory = picks.history;
/** A day's meals: what was picked that day, then any others it logged. */
export const mealsOn = picks.on;
