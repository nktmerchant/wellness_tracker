import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ARROW_HALF_H,
  ARROW_HALF_W,
  ARROW_HIT_PAD,
  ARROW_STROKE,
  ARC_KNOB_R,
  ARC_PREVIEW_R,
  ARC_PREVIEW_WIDTH,
  ARC_R,
  ARC_RIM_EXTRA,
  ARC_WIDTH,
  CORE_ICON_BOX,
  HIT_R,
  ICON_BOX,
  NODE_HOVER_SCALE,
  NODE_R,
  nodesWith,
  PILL_H,
  capsuleRect,
  chevron,
  SAT_HIT_PAD,
  SAT_ORBIT,
  SAT_PREVIEW_ORBIT,
  SAT_PREVIEW_SCALE,
  SAT_R,
  STROKE,
  angleToValue,
  arcPath,
  dialArc,
  dialLabelR,
  dialTicks,
  dialUnset,
  nodeCenter,
  pillDirection,
  pillWidth,
  pillTextAnchor,
  polar,
  satelliteAngles,
  valueAngle,
  valueFraction,
  type Frame,
  type NodeSpec,
  type Pt,
  type Reveal,
  type Slot,
} from './geometry';
import Icon from './Icon';
import { MAX_EXERCISES, exercisesOn, useExerciseHistory } from './exercises';
import { mealsOn, useMealHistory } from './meals';
import { formatDay, slotState, type DayLog, type SlotState } from './useDayLog';

type Props = {
  frame: Frame;
  log: DayLog;
  date: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoDays: (delta: number) => void;
  onOpenTrends: () => void;
  onToggle: (field: 'activities' | 'meals', id: string) => void;
  onSetSleep: (hours: number) => void;
};


/**
 * Which node is open is React state, not CSS :hover. A touch screen has no
 * hover: iOS fakes one on tap and then leaves it stuck, so a :hover-driven
 * node could never be closed again, and a satellite reacting to the fake
 * hover made iOS swallow the tap as "just a hover". So:
 *
 *  - mouse: a node opens while the pointer is over it, and a satellite's
 *    plaque opens while the pointer is over that satellite
 *  - touch: tapping a node opens it, tapping it again closes it, and tapping
 *    anywhere else closes it; plaques never open (no room, and no hover)
 *  - keyboard: focus opens the node (:focus-within) and the plaque
 *    (:focus-visible), all in CSS
 *
 * This file owns geometry — positions, radii, stroke widths — and the
 * stylesheet owns colour and motion.
 */
export default function TriangleNodes({
  frame,
  log,
  date,
  canGoBack,
  canGoForward,
  onGoDays,
  onOpenTrends,
  onToggle,
  onSetSleep,
}: Props) {
  /* The node opened by a tap. Mouse hover is tracked inside each node. */
  const [tapped, setTapped] = useState<NodeSpec['id'] | null>(null);
  /* The ring and the fan are the shown day's own picks, so they change as days are paged. */
  const history = useExerciseHistory();
  const mealPicks = useMealHistory();
  const nodes = useMemo(
    () =>
      nodesWith(
        exercisesOn(history, date, log.activities).slice(0, MAX_EXERCISES),
        mealsOn(mealPicks, date, log.meals),
      ),
    [history, mealPicks, date, log.activities, log.meals],
  );

  /* A tap outside every node closes the open one. The document is an
     external system, hence the effect. */
  useEffect(() => {
    if (!tapped) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest('.node'))) setTapped(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tapped]);

  const tapProps = (id: NodeSpec['id']) => ({
    tapped: tapped === id,
    onTap: () => setTapped((prev) => (prev === id ? null : id)),
  });

  return (
    <svg
      className="pane"
      viewBox={frame.viewBox}
      style={
        {
          '--stroke': `${STROKE}px`,
          '--sat-k': frame.satK,
          '--tick-font': `${frame.tickFont}px`,
          '--date-font': `${frame.dateFont}px`,
          '--hover-scale': NODE_HOVER_SCALE,
          '--preview-scale': SAT_PREVIEW_SCALE,
        } as React.CSSProperties
      }
      role="group"
      aria-label={`Daily log for ${formatDay(date)}: exercise, sleep and eating`}
    >
      {nodes.map((node) =>
        node.reveal.kind === 'dial' ? (
          <DialNode
            key={node.id}
            {...tapProps(node.id)}
            node={node}
            dial={node.reveal}
            value={log.sleepHours}
            onChange={onSetSleep}
          />
        ) : (
          <SlotNode
            key={node.id}
            {...tapProps(node.id)}
            node={node}
            slots={node.reveal.slots}
            stateOf={(id) => slotState(node.id === 'exercise' ? log.activities : log.meals, id)}
            onToggle={(id) => onToggle(node.id === 'exercise' ? 'activities' : 'meals', id)}
          />
        ),
      )}

      <DayArrow arrows={frame.arrows} dir={-1} enabled={canGoBack} onActivate={() => onGoDays(-1)} />
      <DayArrow arrows={frame.arrows} dir={1} enabled={canGoForward} onActivate={() => onGoDays(1)} />

      {/* The date doubles as the way into the trends view. */}
      <g
        className="day-label-button"
        role="button"
        aria-label={`Show trends. Current day ${formatDay(date)}`}
        tabIndex={0}
        onClick={(e) => {
          onOpenTrends();
          if (e.detail > 0) e.currentTarget.blur();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenTrends();
          }
        }}
      >
        <text
          className="day-label"
          x={frame.date.x}
          y={frame.date.y}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {formatDay(date)}
        </text>
      </g>
    </svg>
  );
}

/**
 * A day-step chevron. Disabled rather than hidden at the ends of the range,
 * so the controls do not move when you reach today or the first logged day.
 */
function DayArrow({
  arrows,
  dir,
  enabled,
  onActivate,
}: {
  arrows: Frame['arrows'];
  dir: 1 | -1;
  enabled: boolean;
  onActivate: () => void;
}) {
  const cx = dir === -1 ? arrows.leftX : arrows.rightX;

  return (
    <g
      className={`day-arrow${enabled ? '' : ' is-disabled'}`}
      role="button"
      aria-label={dir === -1 ? 'Previous day' : 'Next day'}
      aria-disabled={!enabled}
      tabIndex={enabled ? 0 : -1}
      onClick={(e) => {
        if (!enabled) return;
        onActivate();
        // Same focus release as the capsules and the dial.
        if (e.detail > 0) e.currentTarget.blur();
      }}
      onKeyDown={(e) => {
        if (!enabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <rect
        className="day-arrow-hit"
        x={cx - ARROW_HALF_W - ARROW_HIT_PAD}
        y={arrows.y - ARROW_HALF_H - ARROW_HIT_PAD}
        width={2 * (ARROW_HALF_W + ARROW_HIT_PAD)}
        height={2 * (ARROW_HALF_H + ARROW_HIT_PAD)}
        fill="none"
        pointerEvents="all"
      />
      <path className="day-arrow-mark" d={chevron(cx, arrows.y, dir)} strokeWidth={ARROW_STROKE} />
    </g>
  );
}

/** Props every node takes for tap-to-open; see TriangleNodes. */
type Tap = { tapped: boolean; onTap: () => void };

/** Shared chrome: the hover target, the core disc, and the category icon. */
function NodeShell({
  node,
  tapped,
  onTap,
  dragging,
  children,
}: Tap & {
  node: NodeSpec;
  dragging?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  /* The pointer that started the current press; a click doesn't say. */
  const pointer = useRef('mouse');
  const c = nodeCenter(node);
  const open = tapped || hovered || dragging;
  const classes = ['node', open && 'is-open', dragging && 'is-dragging']
    .filter(Boolean)
    .join(' ');

  return (
    <g
      className={classes}
      style={{ '--color': node.color } as React.CSSProperties}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      onPointerDown={(e) => {
        pointer.current = e.pointerType;
      }}
      onClick={(e) => {
        /* Taps on the node itself toggle it; taps on its slots or dial are
           theirs. A mouse already opened it by hovering. */
        if (pointer.current === 'mouse') return;
        if (e.target instanceof Element && e.target.closest('.satellite, .meter')) return;
        onTap();
      }}
    >
      {/*
        Invisible target covering the node plus everything it reveals, so the
        pointer can travel out to a slot without the group collapsing.
        fill="none" alone would not receive events, hence pointerEvents.
      */}
      <circle cx={c.x} cy={c.y} r={HIT_R} fill="none" pointerEvents="all" />

      {/* Revealed parts paint first, so they emerge from behind the core. */}
      {children}

      <g className="core-group" style={{ '--cx': c.x, '--cy': c.y } as React.CSSProperties}>
        <circle className="core" cx={c.x} cy={c.y} r={NODE_R} strokeWidth={STROKE} />
        <title>{node.name}</title>
        <Icon name={node.icon} at={c} box={CORE_ICON_BOX} className="core-icon" />
      </g>
    </g>
  );
}

/**
 * One satellite: a tappable checkbox for a slot, which on hover unfurls a
 * plaque carrying its icon and name. A slot can also be half logged, which
 * fills the lower half (aria "mixed").
 */
function SatelliteSlot({
  node,
  slot,
  at,
  angle,
  index,
  state,
  hot,
  onToggle,
  onHover,
  onFocusVisible,
}: {
  node: NodeSpec;
  slot: Slot;
  at: Pt;
  angle: number;
  index: number;
  state: SlotState;
  /** Plaque open: mouse over it, or keyboard focus. Never from a tap. */
  hot: boolean;
  onToggle: () => void;
  /** Mouse over the satellite. */
  onHover: (hovered: boolean) => void;
  /** Keyboard focus. Kept apart from hover so a click's blur can't close the
      plaque under a mouse that is still over it. */
  onFocusVisible: (focused: boolean) => void;
}) {
  const dir = pillDirection(node, angle);
  const cap = capsuleRect(at);
  // At rest the dot slides in along its spoke from SAT_ORBIT to SAT_PREVIEW_ORBIT.
  const pull = polar({ x: 0, y: 0 }, SAT_PREVIEW_ORBIT - SAT_ORBIT, angle);
  const text = pillTextAnchor(at, dir);

  return (
    <g
      className={`satellite${state === 'full' ? ' is-on' : state === 'half' ? ' is-half' : ''}${hot ? ' is-hot' : ''}${dir === -1 ? ' is-left' : ''}`}
      /*
        transform-origin is given explicitly in user units rather than relying
        on fill-box for a <g>, so the scale-in animation pivots on the
        satellite's own center. The plaque unfurls from the same point.
      */
      style={
        {
          '--cx': at.x,
          '--cy': at.y,
          '--pull-x': `${pull.x}px`,
          '--pull-y': `${pull.y}px`,
          '--i': index,
          '--w-closed': cap.closed,
          '--w-open': pillWidth(slot.label),
          '--half-fill': `url(#half-${node.id})`,
        } as React.CSSProperties
      }
      role="checkbox"
      aria-checked={state === 'full' ? true : state === 'half' ? 'mixed' : false}
      aria-label={slot.label}
      tabIndex={0}
      onClick={(e) => {
        onToggle();
        /*
         * Chrome applies :focus-visible to a focused SVG <g> even for mouse
         * clicks — it only exempts natively interactive elements — so without
         * this the capsule stayed expanded after the pointer left. Keyboard
         * activation is handled in onKeyDown and never fires a click with a
         * detail count, so blurring here only affects pointer activation.
         */
        if (e.detail > 0) e.currentTarget.blur();
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(false)}
      /* A tap focuses too; only keyboard focus (:focus-visible) counts. */
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && onFocusVisible(true)}
      onBlur={() => onFocusVisible(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <title>{slot.label}</title>

      {/*
        One shape for both states: at width === height === 2*SAT_R with
        rx === SAT_R this rect IS the circle, and widening it stretches that
        same outline sideways. There is no second disc and no second outline,
        which is what makes it read as the circle expanding. CSS animates the
        width; the attribute is the closed state it falls back to.
      */}
      <rect
        className="capsule"
        x={cap.x}
        y={cap.y}
        width={cap.closed}
        height={PILL_H}
        rx={cap.rx}
        strokeWidth={STROKE}
      />

      {/* Outside the mirrored capsule, so the glyphs are never flipped. */}
      <text
        className="pill-label"
        x={text.x}
        y={text.y}
        textAnchor={text.anchor}
        dominantBaseline="central"
      >
        {slot.label}
      </text>

      <Icon name={slot.icon} at={at} box={ICON_BOX} className="satellite-icon" />
      <circle
        className="satellite-hit"
        cx={at.x}
        cy={at.y}
        r={SAT_R + SAT_HIT_PAD}
        fill="none"
        pointerEvents="all"
      />
    </g>
  );
}

function SlotNode({
  node,
  slots,
  stateOf,
  onToggle,
  ...tap
}: Tap & {
  node: NodeSpec;
  slots: Slot[];
  stateOf: (id: string) => SlotState;
  onToggle: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const hot = (id: string) => id === hovered || id === focused;

  const c = nodeCenter(node);
  const angles = satelliteAngles(node);

  /*
   * SVG has no z-index: paint order is document order, and a plaque is wider
   * than the gap between neighbouring satellites. A plaque only ever grows
   * horizontally away from the core, so painting each side's satellites
   * outermost-first puts every plaque above everything it can reach.
   *
   * The order is fixed. It used to move the hovered satellite to the end, but
   * moving an element in the DOM cancels its running CSS transitions, so the
   * plaque snapped open and its neighbours snapped shut mid-animation.
   */
  const order = slots
    .map((_, i) => i)
    .sort((a, b) => {
      const reach = (i: number) => pillDirection(node, angles[i]) * Math.cos((angles[i] * Math.PI) / 180);
      return reach(b) - reach(a);
    });

  return (
    <NodeShell node={node} {...tap}>
      <HalfFill id={`half-${node.id}`} color={node.color} />
      {order.map((i) => {
        const slot = slots[i];
        return (
          <SatelliteSlot
            key={slot.id}
            node={node}
            slot={slot}
            at={polar(c, SAT_ORBIT, angles[i])}
            angle={angles[i]}
            index={i}
            state={stateOf(slot.id)}
            hot={hot(slot.id)}
            onToggle={() => onToggle(slot.id)}
            onHover={(on) => setHovered((prev) => (on ? slot.id : prev === slot.id ? null : prev))}
            onFocusVisible={(on) =>
              setFocused((prev) => (on ? slot.id : prev === slot.id ? null : prev))
            }
          />
        );
      })}
    </NodeShell>
  );
}

/**
 * The half-logged fill: blank above, the node's colour below, with a hard
 * edge at the middle. Sized to whatever shape uses it, so the split stays
 * level as a capsule widens into its plaque. Referenced by id because a
 * gradient can't take its colour from the shape's CSS variables.
 */
export function HalfFill({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.5" style={{ stopColor: 'var(--blank)' }} />
        <stop offset="0.5" stopColor={color} />
      </linearGradient>
    </defs>
  );
}

type Dial = Extract<Reveal, { kind: 'dial' }>;

/**
 * The bezeled dial: three arcs sharing one radius — rim, channel, then fill.
 * Outlining a stroked arc would normally mean rebuilding the band as a closed
 * path; instead the black rim is drawn wider than the channel on top of it, so
 * the overhang reads as the outline for free.
 *
 * pathLength="100" normalizes the dash maths to percentages, so the value's
 * fraction is used directly without ever measuring the path.
 */
function DialNode({
  node,
  dial,
  value,
  onChange,
  ...tap
}: Tap & {
  node: NodeSpec;
  dial: Dial;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const groupRef = useRef<SVGGElement>(null);

  /*
   * Before anything is logged the dial still has to render somewhere, so it
   * draws at its unset position in grey. `shown` is what the arc and knob
   * use; `value` stays null so nothing reads it as a logged figure.
   */
  const unset = value === null;
  const shown = unset ? dialUnset(dial) : value;

  const c = nodeCenter(node);
  const { start, end } = dialArc(node, dial);
  const track = arcPath(c, ARC_R, start, end);
  const fraction = valueFraction(dial, shown);
  const knob = polar(c, ARC_R, valueAngle(node, dial, shown));
  const previewK = ARC_PREVIEW_R / ARC_R;

  /** Screen coords -> SVG user units -> bearing from the node center. */
  function valueAt(clientX: number, clientY: number): number {
    const ctm = groupRef.current?.ownerSVGElement?.getScreenCTM();
    // No CTM means no usable mapping, so leave the dial where it reads now.
    if (!ctm) return shown;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const deg = (Math.atan2(-(p.y - c.y), p.x - c.x) * 180) / Math.PI;
    return angleToValue(node, dial, deg);
  }

  // Stepping out of the unset state starts from where the knob is parked.
  const step = (delta: number) =>
    onChange(Math.min(dial.max, Math.max(dial.min, shown + delta * dial.step)));

  return (
    <NodeShell node={node} {...tap} dragging={dragging}>
      <g
        ref={groupRef}
        className={`meter${unset ? ' is-unset' : ''}`}
        style={
          {
            '--cx': c.x,
            '--cy': c.y,
            '--dash-end': 100 - fraction * 100,
            /*
             * Full and preview stroke widths, so the stylesheet holds none.
             * The preview is drawn scaled down by --preview-k, so its widths
             * are divided by it to land at their intended on-screen weight.
             */
            '--preview-k': previewK,
            '--rim-w': `${ARC_WIDTH + ARC_RIM_EXTRA}px`,
            '--chan-w': `${ARC_WIDTH}px`,
            '--rim-sm': `${(ARC_PREVIEW_WIDTH + ARC_RIM_EXTRA) / previewK}px`,
            '--chan-sm': `${ARC_PREVIEW_WIDTH / previewK}px`,
          } as React.CSSProperties
        }
        role="slider"
        aria-label={`${node.name}, hours`}
        aria-valuemin={dial.min}
        aria-valuemax={dial.max}
        aria-valuenow={shown}
        aria-valuetext={unset ? 'Not logged' : `${shown} hours`}
        tabIndex={0}
        onPointerDown={(e) => {
          // Capture so a drag that leaves the arc still tracks the pointer.
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onChange(valueAt(e.clientX, e.clientY));
        }}
        onPointerMove={(e) => {
          if (dragging) onChange(valueAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          /*
           * Pointer-down focuses this <g>, and the node's :focus-within then
           * holds it open after the pointer leaves — the same reason a
           * clicked capsule used to stay expanded. Dropping focus on release
           * only affects pointer use; keyboard adjustment goes through
           * onKeyDown and never fires pointerup.
           */
          e.currentTarget.blur();
        }}
        onPointerCancel={(e) => {
          setDragging(false);
          e.currentTarget.blur();
        }}
        onKeyDown={(e) => {
          const nudge: Record<string, number> = {
            ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1,
          };
          if (e.key in nudge) {
            e.preventDefault();
            step(nudge[e.key]);
          } else if (e.key === 'Home') {
            e.preventDefault();
            onChange(dial.min);
          } else if (e.key === 'End') {
            e.preventDefault();
            onChange(dial.max);
          }
        }}
      >
        {/* Invisible, wider than the bar, so a finger doesn't have to land on it. */}
        <path className="meter-hit" d={track} strokeWidth={ARC_WIDTH * 2.5} />
        <path className="meter-rim" d={track} strokeWidth={ARC_WIDTH + ARC_RIM_EXTRA} />
        <path className="meter-channel" d={track} strokeWidth={ARC_WIDTH} />
        {/* Same width as the channel, so the fill reaches both of its edges. */}
        <path className="meter-fill" d={track} strokeWidth={ARC_WIDTH} pathLength={100} />
        <circle
          className="meter-knob"
          cx={knob.x}
          cy={knob.y}
          r={ARC_KNOB_R}
          strokeWidth={STROKE}
        />

        {/* Every whole hour, so the scale reads as a ruler. */}
        {dialTicks(dial).map((v) => {
          const p = polar(c, dialLabelR(), valueAngle(node, dial, v));
          return (
            <text
              key={v}
              className="dial-tick"
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {v}
            </text>
          );
        })}
      </g>
    </NodeShell>
  );
}
