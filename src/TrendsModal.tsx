import { useEffect, useRef } from 'react';
import { AccountLine } from './Account';
import Icon from './Icon';
import { NODES, type NodeSpec, type Slot } from './geometry';
import {
  FIRST_DAY,
  WEEKDAY_INITIALS,
  formatShortDay,
  readDay,
  useLogVersion,
  startOfWeek,
  weekDays,
  type DayLog,
} from './useDayLog';

/*
 * One Monday-to-Sunday week per view, so every lane has the same seven ticks
 * whether or not those days hold anything. Fixed columns are the point: the
 * shape of a week is comparable to the shape of any other week.
 *
 * Lanes are drawn in a fixed viewBox and scaled to the modal's width
 * (width:100%, height:auto), so the whole view fits without scrolling.
 */
const DESIGN_W = 1000;
/** Band above each lane's plot, holding its title. */
const TITLE_H = 24;
/** Plot height, identical for all three lanes. */
const PLOT_H = 164;
const LANE_H = TITLE_H + PLOT_H;
const AXIS_H = 38;
const GUTTER = 120;
const PAD_R = 28;
const PAD_V = 10;
const DAYS_PER_WEEK = 7;

/**
 * The sleep lane's display floor. Nights at or below this plot on the bottom
 * gridline, so the plotted band is the range worth distinguishing rather than
 * the dial's full 0-9. Two short nights therefore sit at the same height —
 * the "<=5hr" label is what says so, and the tooltip still reports the real
 * figure.
 */
const SLEEP_FLOOR = 5;

/**
 * The right edge shared by every lane's title and its row labels — which is
 * why the titles live in the SVG rather than in HTML above it. Only inside
 * the same scaled coordinate system can "Eating" be made to end exactly
 * where "Breakfast" does.
 */
const LABEL_X = GUTTER - 14;

const COL_W = (DESIGN_W - GUTTER - PAD_R) / DAYS_PER_WEEK;
const colX = (i: number) => GUTTER + COL_W * (i + 0.5);

/** Vertical gaps: between stacked exercise discs, and between punch-card rows. */
const STACK_GAP = 4;
const ROW_GAP = 3;

/**
 * ONE radius for every mark in every lane, so circles match across
 * categories. Three things can limit it, and the tightest wins:
 *
 *  - rows:   the punch card stacks `rows` discs plus gaps inside the plot,
 *            which in practice is the binding constraint
 *  - stack:  a multi-activity day stacks discs centred on the exercise spine
 *  - column: the horizontal pitch, so dense marks never touch sideways
 */
function sharedRadius(busiest: number, rows: number): number {
  const byRows = (PLOT_H - 2 * PAD_V - (rows - 1) * ROW_GAP) / (2 * rows);
  const half = PLOT_H / 2 - PAD_V;
  const byStack = (half - ((busiest - 1) / 2) * STACK_GAP) / busiest;
  const byColumn = COL_W * 0.34;
  return Math.min(byRows, byStack, byColumn);
}

/**
 * A day in the displayed week. `future` is not the same as empty: a Thursday
 * that has not happened yet must not read as a Thursday you skipped, so it
 * gets its own faint mark rather than the hollow "missed" one.
 */
type Day = { date: string; log: DayLog; future: boolean };

export default function TrendsModal({
  open,
  weekStart,
  today,
  onWeekStart,
  onClose,
}: {
  open: boolean;
  weekStart: string;
  today: string;
  onWeekStart: (monday: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  /*
   * The only effect here, and a legitimate one: <dialog> is an external system
   * that owns focus trapping and Escape, so React just syncs it open/shut.
   * Which week is shown is set by whatever opened the modal, not by an effect.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const firstWeek = startOfWeek(FIRST_DAY);
  const currentWeek = startOfWeek(today);

  /* Re-read on every render (seven small reads) so an edit or a sync
     from another device shows up while the modal is open. */
  useLogVersion();
  const days: Day[] = weekDays(weekStart).map((d) => ({
    date: d,
    log: readDay(d),
    future: d > today,
  }));

  /* weekStart is already a Monday, so stepping is just +/- whole weeks. */
  const goWeeks = (delta: number) => {
    const target = shiftWeek(weekStart, delta);
    if (target < firstWeek || target > currentWeek) return;
    onWeekStart(target);
  };

  const exercise = NODES.find((n) => n.id === 'exercise')!;
  const meals = NODES.find((n) => n.id === 'meals')!;
  const sleep = NODES.find((n) => n.id === 'sleep')!;
  const mealRows = meals.reveal.kind === 'fan' ? meals.reveal.slots.length : 5;

  const busiest = Math.max(1, ...days.map((d) => (d.future ? 0 : d.log.activities.length)));
  const R = sharedRadius(busiest, mealRows);

  return (
    <dialog
      ref={ref}
      className="trends"
      aria-label="Trends by week"
      onClose={onClose}
      /* Clicking the backdrop reports the dialog itself as the target. */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="trends-head">
        <div className="week-nav">
          <button
            type="button"
            aria-label="Previous week"
            disabled={weekStart <= firstWeek}
            onClick={() => goWeeks(-1)}
          >
            <NavChevron dir={-1} />
          </button>
          <span className="week-label">Week of {formatShortDay(weekStart)}, {weekStart.slice(0, 4)}</span>
          <button
            type="button"
            aria-label="Next week"
            disabled={weekStart >= currentWeek}
            onClick={() => goWeeks(1)}
          >
            <NavChevron dir={1} />
          </button>
        </div>

        <button type="button" className="trends-close" onClick={onClose} aria-label="Close trends">
          ×
        </button>
      </div>

      <div className="trends-body">
        <ExerciseLane node={exercise} days={days} r={R} />
        <MealsLane node={meals} days={days} r={R} />
        <SleepLane node={sleep} days={days} r={R} />
        <Axis days={days} />
      </div>
      <AccountLine />
    </dialog>
  );
}

/** Weeks are seven days, so stepping them is stepping days by sevens. */
function shiftWeek(monday: string, weeks: number): string {
  const [y, m, d] = monday.split('-').map(Number);
  const dt = new Date(y, m - 1, d + weeks * 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function NavChevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg className="nav-chevron" viewBox="0 0 22 22" aria-hidden="true">
      <path d={dir === 1 ? 'M 8 4 L 15 11 L 8 18' : 'M 14 4 L 7 11 L 14 18'} />
    </svg>
  );
}

/**
 * Lane shell. xMinYMid pins the content to the left edge, so a lane never
 * drifts inward if it is ever given a box wider than its aspect ratio.
 */
function Lane({
  title,
  label,
  color,
  children,
}: {
  title: string;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lane">
      <svg
        className="chart"
        viewBox={`0 0 ${DESIGN_W} ${LANE_H}`}
        preserveAspectRatio="xMinYMid meet"
        role="img"
        /* Single-series lanes, so the title carries identity — no legend. */
        aria-label={`${title}: ${label}`}
        style={{ '--color': color } as React.CSSProperties}
      >
        <text
          className="lane-title"
          x={LABEL_X}
          y={TITLE_H / 2}
          textAnchor="end"
          dominantBaseline="central"
        >
          {title}
        </text>
        {children}
      </svg>
    </div>
  );
}

/**
 * One column per day on a line through the plot's middle, connected where
 * consecutive days were both exercised. A logged day with nothing is a hollow
 * disc; a day still to come is faint.
 *
 * Multiple activities stack vertically, centred on the spine. That keeps the
 * connecting line a straight horizontal run: on a two-activity day it passes
 * between the pair, which reads as the line splitting around them, and on an
 * odd count a disc sits on the line itself.
 */
function ExerciseLane({ node, days, r }: { node: NodeSpec; days: Day[]; r: number }) {
  if (node.reveal.kind === 'dial') return null;
  const slots = node.reveal.slots;
  const spine = TITLE_H + PLOT_H / 2;
  const step = 2 * r + STACK_GAP;

  const marks = days.map((day, i) => ({
    day,
    x: colX(i),
    /* Slot order, not click order, so a day's stack never reshuffles. */
    done: day.future ? [] : slots.filter((s) => day.log.activities.includes(s.id)),
  }));

  /* Runs break at missed days AND at days not yet reached. */
  const segments: number[][] = [];
  let run: number[] = [];
  for (const m of marks) {
    if (m.done.length) run.push(m.x);
    else if (run.length) {
      segments.push(run);
      run = [];
    }
  }
  if (run.length) segments.push(run);

  const elapsed = days.filter((d) => !d.future).length;
  const count = marks.filter((m) => m.done.length).length;
  const sessions = marks.reduce((a, m) => a + m.done.length, 0);

  return (
    <Lane
      title="Exercise"
      color={node.color}
      label={`on ${count} of ${elapsed} days so far, ${sessions} sessions`}
    >
      {segments.map((seg) => (
        <polyline key={seg[0]} className="line" points={seg.map((x) => `${x},${spine}`).join(' ')} />
      ))}

      {marks.map(({ day, x, done }) =>
        done.length === 0 ? (
          <g key={day.date}>
            <title>
              {`${formatShortDay(day.date)}: ${day.future ? 'still to come' : 'nothing logged'}`}
            </title>
            <circle className={`cell ${day.future ? 'is-future' : 'is-off'}`} cx={x} cy={spine} r={r} />
          </g>
        ) : (
          done.map((slot: Slot, k) => {
            const y = spine + (k - (done.length - 1) / 2) * step;
            return (
              <g key={`${day.date}-${slot.id}`}>
                <title>{`${formatShortDay(day.date)}: ${slot.label}`}</title>
                <circle className="cell is-on" cx={x} cy={y} r={r} />
                <Icon name={slot.icon} at={{ x, y }} box={r * 1.5} className="cell-icon" />
              </g>
            );
          })
        ),
      )}
    </Lane>
  );
}

/** A punch card: one row per meal, one column per day, filling the plot. */
function MealsLane({ node, days, r }: { node: NodeSpec; days: Day[]; r: number }) {
  if (node.reveal.kind === 'dial') return null;
  const slots = node.reveal.slots;

  /* Inset by r at both ends, so the outer rows sit fully inside the plot. */
  const top = TITLE_H + PAD_V + r;
  const bottom = TITLE_H + PLOT_H - PAD_V - r;
  const rowY = (i: number) => top + (i * (bottom - top)) / (slots.length - 1);

  const elapsed = days.filter((d) => !d.future).length;
  const complete = days.filter((d) => !d.future && d.log.meals.length === slots.length).length;

  return (
    <Lane title="Eating" color={node.color} label={`all five on ${complete} of ${elapsed} days so far`}>
      {slots.map((slot, i) => (
        <g key={slot.id}>
          <text className="row-label" x={LABEL_X} y={rowY(i)} textAnchor="end" dominantBaseline="central">
            {slot.label}
          </text>
          {days.map((day, c) => {
            const on = !day.future && day.log.meals.includes(slot.id);
            const state = day.future ? 'is-future' : on ? 'is-on' : 'is-off';
            return (
              <g key={day.date}>
                <title>
                  {`${formatShortDay(day.date)} · ${slot.label}: ${
                    day.future ? 'still to come' : on ? 'logged' : 'not logged'
                  }`}
                </title>
                <circle className={`cell ${state}`} cx={colX(c)} cy={rowY(i)} r={r} />
              </g>
            );
          })}
        </g>
      ))}
    </Lane>
  );
}

/**
 * Hours per night as a line with a point per logged night. The line is cut
 * into segments at unlogged nights rather than bridging them — joining across
 * a gap would draw a night that was never recorded.
 */
function SleepLane({ node, days, r }: { node: NodeSpec; days: Day[]; r: number }) {
  if (node.reveal.kind !== 'dial') return null;
  const dial = node.reveal;

  const top = TITLE_H + PAD_V + r;
  const bottom = TITLE_H + PLOT_H - PAD_V - r;
  const floor = Math.max(SLEEP_FLOOR, dial.min);
  const yFor = (v: number) =>
    bottom - ((Math.max(v, floor) - floor) / (dial.max - floor)) * (bottom - top);

  const points = days.map((d, i) =>
    d.future || d.log.sleepHours === null
      ? null
      : { x: colX(i), y: yFor(d.log.sleepHours), v: d.log.sleepHours, date: d.date },
  );

  const segments: NonNullable<(typeof points)[number]>[][] = [];
  let run: NonNullable<(typeof points)[number]>[] = [];
  for (const p of points) {
    if (p) run.push(p);
    else if (run.length) {
      segments.push(run);
      run = [];
    }
  }
  if (run.length) segments.push(run);

  const logged = points.filter(Boolean) as NonNullable<(typeof points)[number]>[];
  const elapsed = days.filter((d) => !d.future).length;
  const mean = logged.length ? logged.reduce((a, p) => a + p.v, 0) / logged.length : null;

  return (
    <Lane
      title="Sleep"
      color={node.color}
      label={
        mean === null
          ? 'nothing logged this week'
          : `on ${logged.length} of ${elapsed} nights so far, averaging ${mean.toFixed(1)} hours`
      }
    >
      {/* Recessive: enough to read values against, quiet enough to ignore. */}
      {hourTicks(floor, dial.max).map((v) => (
        <g key={v}>
          <line className="grid" x1={GUTTER - 6} y1={yFor(v)} x2={DESIGN_W - PAD_R} y2={yFor(v)} />
          <text className="row-label" x={LABEL_X} y={yFor(v)} textAnchor="end" dominantBaseline="central">
            {v === floor ? `≤${v}hr` : `${v}hr`}
          </text>
        </g>
      ))}

      {segments.map((seg) => (
        <polyline key={seg[0].date} className="line" points={seg.map((p) => `${p.x},${p.y}`).join(' ')} />
      ))}

      {logged.map((p) => (
        <g key={p.date}>
          <title>{`${formatShortDay(p.date)}: ${p.v} hours`}</title>
          <circle className="point" cx={p.x} cy={p.y} r={r} />
        </g>
      ))}
    </Lane>
  );
}

/** Whole hours from the display floor to the dial's maximum. */
function hourTicks(floor: number, max: number): number[] {
  const out: number[] = [];
  for (let v = floor; v <= max; v++) out.push(v);
  return out;
}

/** Shared axis: weekday initial over day number, on the lanes' column grid. */
function Axis({ days }: { days: Day[] }) {
  return (
    <svg
      className="chart axis"
      viewBox={`0 0 ${DESIGN_W} ${AXIS_H}`}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
    >
      {days.map((day, i) => (
        <g key={day.date} className={day.future ? 'is-future' : undefined}>
          <text className="axis-dow" x={colX(i)} y={12} textAnchor="middle">
            {WEEKDAY_INITIALS[i]}
          </text>
          <text className="axis-day" x={colX(i)} y={30} textAnchor="middle">
            {Number(day.date.slice(8))}
          </text>
        </g>
      ))}
    </svg>
  );
}
