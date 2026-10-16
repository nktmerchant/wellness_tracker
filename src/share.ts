/**
 * One day as plain text to paste anywhere: a section per node, headed by a
 * dot in the node's colour, with a short emoji list under each. Everything is
 * emoji or plain text, so it survives any chat app.
 */
import { NODES, type Slot } from './geometry';
import { mealState, readDay } from './useDayLog';

const LINK = 'https://nktmerchant.github.io/wellness_tracker/';

/** Each slot's emoji, chosen to echo its icon in the figure. */
const EMOJI: Record<string, string> = {
  ski: '⛷️',
  run: '🏃',
  bike: '🚴',
  climb: '🧗',
  surf: '🏄',
  strength: '🏋️',
  core: '🤸',
  meditate: '🧘',
  breakfast: '☕',
  midMorning: '🍎',
  lunch: '🍔',
  dinner: '🍽️',
  supper: '🍜',
};

/*
 * Many chat apps trim leading ordinary spaces on paste. An em space is not
 * trimmed, and an en space after it brings the indent to about four spaces.
 */
const INDENT = '  ';
const NONE = '⬜';
const MEAL = '🟦';
const HOUR = '🟩';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
                'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

function slotsOf(id: string): Slot[] {
  const n = NODES.find((x) => x.id === id)!;
  return n.reveal.kind === 'dial' ? [] : n.reveal.slots;
}

function sleepMax(): number {
  const n = NODES.find((x) => x.id === 'sleep')!;
  return n.reveal.kind === 'dial' ? n.reveal.max : 9;
}

/**
 * Text widths in the system font, which is what the reader most likely sees
 * too (an iPhone sending to an iPhone). Only used to line up the meal boxes,
 * so a different font on the other end costs a dot or two of alignment.
 */
let ctx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string): number {
  if (ctx === undefined) {
    ctx = document.createElement('canvas').getContext('2d');
    if (ctx) ctx.font = '17px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif';
  }
  return ctx ? ctx.measureText(s).width : s.length * 9;
}

/**
 * Meal lines end in a two-box meter. Names differ in width, so each is padded
 * with middle dots out to a shared edge; dots are narrow, which lets the
 * boxes land within about a dot of each other even in a proportional font.
 */
function mealLines(meals: string[]): string[] {
  const slots = slotsOf('meals');
  const dot = textWidth('·');
  const edge = Math.max(...slots.map((s) => textWidth(s.label))) + 3 * dot;
  return slots.map((s) => {
    const dots = Math.max(2, Math.round((edge - textWidth(s.label)) / dot));
    const st = mealState(meals, s.id);
    const boxes = st === 'full' ? MEAL + MEAL : st === 'half' ? MEAL + NONE : NONE + NONE;
    return `${INDENT}${EMOJI[s.id]} ${s.label} ${'·'.repeat(dots)} ${boxes}`;
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
  const done = slotsOf('exercise').filter((s) => log.activities.includes(s.id));
  const exercise = done.length
    ? done.map((s) => `${INDENT}${EMOJI[s.id]} ${s.label}`)
    : [`${INDENT}🛋️ Rest day`];

  return [
    title(date),
    '',
    '🔴 Exercise',
    ...exercise,
    '',
    '🔵 Eating',
    ...mealLines(log.meals),
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
export const SHARE_SHEET = window.matchMedia('(pointer: coarse)').matches && !!navigator.share;

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
