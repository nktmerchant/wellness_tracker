/**
 * One day as plain text to paste anywhere: a section per node, headed by a
 * dot in the node's colour, with a short emoji list under each. Everything is
 * emoji or plain text, so it survives any chat app.
 */
import { exerciseHistory, exercisesOn } from './exercises';
import { NODES } from './geometry';
import { mealHistory, mealsOn } from './meals';
import { slotState, readDay } from './useDayLog';

const LINK = 'https://nktmerchant.github.io/wellness_tracker/';

/** Each meal's emoji, chosen to echo its icon. Exercises carry their own. */
const EMOJI: Record<string, string> = {
  breakfast: '☕',
  midMorning: '🍎',
  lunch: '🍔',
  dinner: '🍽️',
  supper: '🍪',
};

/*
 * Many chat apps trim leading ordinary spaces on paste. An em space is not
 * trimmed, and an en space after it brings the indent to about four spaces.
 */
const INDENT = '  ';
const NONE = '⬜';
const DONE = '🟥';
const MEAL = '🟦';
const HOUR = '🟩';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
                'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

function sleepMax(): number {
  const n = NODES.find((x) => x.id === 'sleep')!;
  return n.reveal.kind === 'dial' ? n.reveal.max : 9;
}

/**
 * Meal lines lead with a two-box meter. Emoji are about the same width in
 * any font, so leading with them keeps the boxes lined up wherever the text
 * lands; the names, which vary, trail off to the right.
 */
function mealLines(date: string, meals: string[]): string[] {
  return mealsOn(mealHistory(), date, meals).map((s) => {
    const st = slotState(meals, s.id);
    const boxes = st === 'full' ? MEAL + MEAL : st === 'half' ? MEAL + NONE : NONE + NONE;
    return `${INDENT}${boxes} ${EMOJI[s.id]} ${s.label}`;
  });
}

/**
 * A box per hour up to the dial's maximum. Only whole hours fill, so the bar
 * never overstates a night; the figure beside it is exact.
 */
function sleepLine(hours: number | null): string {
  const max = sleepMax();
  if (hours === null) return `${INDENT}${NONE.repeat(max)}  Not logged`;
  const full = Math.min(max, Math.floor(hours));
  return `${INDENT}${HOUR.repeat(full)}${NONE.repeat(max - full)}  ${hours} hr${hours === 1 ? '' : 's'}`;
}

/** "Wednesday, Oct. 14": no year, as in the trends view. */
function title(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

export function dayShare(date: string): string {
  const log = readDay(date);

  /* Slot order, not tap order, so the same day always reads the same. */
  const done = exercisesOn(exerciseHistory(), date, log.activities).filter((s) => slotState(log.activities, s.id) !== 'empty');
  const exercise = done.length
    ? done.map((s) => {
        const boxes = slotState(log.activities, s.id) === 'full' ? DONE + DONE : DONE + NONE;
        return `${INDENT}${boxes} ${s.emoji} ${s.label}`;
      })
    : [`${INDENT}${NONE}${NONE} 🛋️ Rest day`];

  return [
    title(date),
    '',
    '🔴 Exercise',
    ...exercise,
    '',
    '🔵 Eating',
    ...mealLines(date, log.meals),
    '',
    '🟢 Sleep',
    sleepLine(log.sleepHours),
    '',
    LINK,
  ].join('\n');
}

/**
 * The share sheet on touch devices, where that is how people pass text on;
 * the clipboard elsewhere, as Wordle does. Resolves to what happened, or
 * null when the person dismissed the share sheet.
 */
const SHARE_SHEET = window.matchMedia('(pointer: coarse)').matches && !!navigator.share;

export async function sendShare(text: string): Promise<'shared' | 'copied' | null> {
  if (SHARE_SHEET) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      /* Otherwise fall through to the clipboard. */
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
