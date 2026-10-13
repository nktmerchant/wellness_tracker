/**
 * All layout math for the triangle of nodes lives here, in SVG user units.
 * The pane scales its viewBox to the container, so every number below is
 * resolution-independent — tweak these and the whole figure follows.
 */
import type { IconName } from './icons';

/**
 * Shapes are a uniform 2x of the original proportions, so nothing about their
 * relationship to each other changes.
 *
 * On-screen size is NOT set by these numbers alone — it is
 * (size in user units) / (viewBox size) x (rendered pane size). Because the
 * viewBox is derived from the geometry below, scaling these alone is close to
 * a no-op: the frame grows with the shapes and the figure just refills the
 * pane. ZOOM is the control for apparent size.
 */
const SCALE = 2;

export const NODE_R = 76 * SCALE;
export const NODE_HOVER_SCALE = 1.18;

/** Cel-shaded outline weight, in user units, shared by every shape. */
export const STROKE = 7;

export const SAT_R = 20 * SCALE;
/** Distance from a node's center to each satellite's center. */
export const SAT_ORBIT = 128 * SCALE;

export const ARC_R = 122 * SCALE;
export const ARC_WIDTH = 26 * SCALE;
/** Total angular span of the dial, centered on the outward axis. */
export const ARC_SPAN = 140;
/** Extra stroke width that turns the dial's rim layer into its outline. */
export const ARC_RIM_EXTRA = 14;

/*
 * At rest each node shows a preview of its own contents: the satellites as
 * small plain dots, the dial as a thin bar. Hovering grows those same shapes
 * rather than swapping in different ones.
 *
 * The satellites scale about their own centres and also slide inward to
 * SAT_PREVIEW_ORBIT, hugging the core. The dial scales about the node's
 * centre down to ARC_PREVIEW_R. That scale would thin its strokes too, so the
 * preview widths are divided back out (see DialNode). The rim stays
 * ARC_RIM_EXTRA wider than the channel at both sizes, so the cel outline keeps
 * its weight.
 *
 * The two preview radii are set so the dots and the bar leave the same gap
 * to the core's edge.
 */
export const SAT_PREVIEW_SCALE = 0.4;
export const SAT_PREVIEW_ORBIT = 200;
export const ARC_PREVIEW_WIDTH = 14;
export const ARC_PREVIEW_R = 196;
/** Radial offset of the dial's labels, past the rim. */
export const DIAL_LABEL_OFFSET = 25;
/** Every whole hour is labelled along the sweep; halves are draggable only. */
export const DIAL_TICK_FONT = 34;
/** End cap on the fill, inscribed exactly in the channel's width. */
export const ARC_KNOB_R = (ARC_WIDTH - STROKE) / 2;

/**
 * Extra transparent radius on each satellite. At the rendered zoom a bare
 * SAT_R disc is about 39px across, under the ~44px comfortable tap target, so
 * the hit area is padded past the visible edge.
 */
export const SAT_HIT_PAD = 12;

/** Icon box inside a satellite. MDI art has padding, so this exceeds SAT_R. */
export const ICON_BOX = SAT_R * 1.6;
/** Icon box inside a core. */
export const CORE_ICON_BOX = NODE_R * 1.25;

/* ---- label plaques ---- */

/**
 * On hover a single satellite stretches sideways into a capsule carrying its
 * icon and name. Only the hovered one opens: eight at once would collide.
 *
 * The capsule is ONE rect, not a plaque behind a disc — a rect whose width
 * equals its height and whose rx is half of it renders as a perfect circle,
 * so widening it reads as the circle physically stretching. That only holds
 * while these two hold:
 *   PILL_H === SAT_R * 2   (caps are exactly the disc's diameter)
 *   rx     === SAT_R       (caps are exactly the disc's curvature)
 * Change one and the ends stop matching the circle they grow out of.
 */
export const PILL_H = SAT_R * 2;
export const PILL_FONT = 34;
/** Gap between the disc's edge and the start of the text. */
export const PILL_GAP = 16;
/** Padding between the end of the text and the end of the plaque. */
export const PILL_END = 28;
/**
 * Average advance width per character, in em, for the bold UI sans stack.
 * An estimate — SVG text cannot be measured before layout — so it is checked
 * against getComputedTextLength in the browser and kept comfortably wide.
 */
export const PILL_CHAR_EM = 0.62;

export type Pt = { x: number; y: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Polar to cartesian, in degrees, counter-clockwise from the +x axis.
 * SVG's y axis points down, so y is subtracted — this keeps 90deg meaning
 * "up" everywhere in this file, which is what the triangle math assumes.
 */
export function polar(origin: Pt, r: number, deg: number): Pt {
  return { x: origin.x + r * Math.cos(rad(deg)), y: origin.y - r * Math.sin(rad(deg)) };
}

/** A stroked arc, drawn counter-clockwise from startDeg to endDeg. */
export function arcPath(origin: Pt, r: number, startDeg: number, endDeg: number): string {
  const s = polar(origin, r, startDeg);
  const e = polar(origin, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  // Increasing angle is counter-clockwise on screen, which is sweep-flag 0.
  const sweep = endDeg > startDeg ? 0 : 1;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/** How far a node's satellites reach from its own center, outline included. */
export const FOOTPRINT = SAT_ORBIT + SAT_R + STROKE / 2;

/**
 * Closest the nodes can sit before neighbouring satellites would collide: the
 * spacing at which two footprints exactly touch, since an equilateral
 * triangle's side is R * sqrt(3).
 */
const MIN_TRIANGLE_R = (2 * FOOTPRINT) / Math.sqrt(3);

/**
 * Breathing room beyond that minimum. Raising it spreads the nodes and, since
 * the frame grows to match, shrinks them on screen.
 */
const SPREAD = 1.06;

/** Distance from the centroid out to each node's center. */
export const TRIANGLE_R = MIN_TRIANGLE_R * SPREAD;

/**
 * How much of the available space the figure fills, as a display zoom. This
 * is the control for apparent size — see the note on SCALE above.
 */
export const ZOOM = 0.75;

/** Blank user units kept outside the figure on every side. */
const MARGIN = 16;

/* ---- content ---- */

export type Slot = { id: string; label: string; icon: IconName };

export type Reveal =
  /**
   * Slots fanned symmetrically about an axis. `axisDeg` defaults to the node's
   * outward axis; setting it aims the fan somewhere else, which gives up the
   * collinearity property described on satelliteAngles.
   */
  | { kind: 'fan'; slots: Slot[]; spacingDeg: number; axisDeg?: number }
  /**
   * Slots spaced evenly around the full circle, anchored at the node's outward
   * axis plus `phaseDeg`.
   */
  | { kind: 'ring'; slots: Slot[]; phaseDeg?: number }
  /**
   * A bezeled arc dragged to set a single value. `axisDeg` defaults to the
   * node's outward axis; setting it swings the arc elsewhere.
   */
  | {
      kind: 'dial';
      min: number;
      max: number;
      step: number;
      unit: string;
      axisDeg?: number;
      /** Where the knob parks before anything is logged; defaults to midway. */
      unsetAt?: number;
    };

export type NodeId = 'exercise' | 'sleep' | 'meals';

export type NodeSpec = {
  id: NodeId;
  name: string;
  /**
   * Direction from the centroid to this node, in degrees. It doubles as the
   * node's "outward axis", which is what makes a fan's middle slot collinear
   * with the node center and the centroid for free.
   */
  outward: number;
  color: string;
  icon: IconName;
  reveal: Reveal;
};

export const NODES: NodeSpec[] = [
  {
    id: 'exercise',
    name: 'Exercise',
    outward: 90,
    color: '#e03131',
    icon: 'exercise',
    reveal: {
      kind: 'ring',
      /*
       * Half of the 45deg step. Without it a slot lands on the vertical axis,
       * where it has no horizontal side to unfurl into: the plaque falls back
       * to one side and clips a diagonal neighbour. Offsetting by half a step
       * keeps every slot clearly left or right of center, so the eight split
       * four plaques down each side.
       */
      phaseDeg: 22.5,
      slots: [
        { id: 'ski', label: 'Ski', icon: 'ski' },
        { id: 'run', label: 'Run', icon: 'run' },
        { id: 'bike', label: 'Bike', icon: 'bike' },
        { id: 'climb', label: 'Climb', icon: 'climb' },
        { id: 'surf', label: 'Surf', icon: 'surf' },
        { id: 'strength', label: 'Strength', icon: 'strength' },
        { id: 'core', label: 'Core', icon: 'core' },
        { id: 'meditate', label: 'Meditate', icon: 'meditate' },
      ],
    },
  },
  {
    id: 'meals',
    name: 'Eating',
    outward: 210,
    color: '#1971c2',
    icon: 'eating',
    reveal: {
      kind: 'fan',
      /*
       * Aimed due left rather than along the outward axis (210deg). On the
       * outward axis the lowest slot sat at 270deg, and its plaque — which
       * unfurls left — covered the slot above it. Running the fan down the
       * node's left side separates them, at the cost of the middle slot no
       * longer lining up with the triangle's centroid.
       */
      axisDeg: 180,
      spacingDeg: 30,
      slots: [
        { id: 'breakfast', label: 'Breakfast', icon: 'breakfast' },
        { id: 'midMorning', label: 'Mid-morning', icon: 'midMorning' },
        { id: 'lunch', label: 'Lunch', icon: 'lunch' },
        { id: 'dinner', label: 'Dinner', icon: 'dinner' },
        { id: 'supper', label: 'Supper', icon: 'supper' },
      ],
    },
  },
  {
    id: 'sleep',
    name: 'Sleep',
    outward: 330,
    color: '#2f9e44',
    icon: 'sleep',
    reveal: {
      kind: 'dial',
      /* Swung to hang straight down rather than out toward the corner. */
      axisDeg: 270,
      min: 0,
      max: 9,
      step: 0.5,
      unit: 'h',
    },
  },
];

/**
 * Slot angles for a node, as absolute degrees. Independent of CENTER, so the
 * frame derivation below can call it.
 *
 * A `fan` is symmetric about its axis, so with an ODD number of slots the
 * middle one lands exactly on that axis. When the axis is the node's outward
 * direction, that makes the middle slot collinear with the node center and
 * the triangle centroid by construction. A fan with an explicit `axisDeg`
 * trades that property away for a different arrangement.
 *
 * A `ring` divides 360deg evenly, anchored at the outward axis plus its
 * `phaseDeg`, so the arrangement stays visually tied to the triangle.
 */
export function satelliteAngles(node: NodeSpec): number[] {
  const { reveal, outward } = node;
  if (reveal.kind === 'ring') {
    const n = reveal.slots.length;
    const phase = reveal.phaseDeg ?? 0;
    return reveal.slots.map((_, i) => outward + phase + (i * 360) / n);
  }
  if (reveal.kind === 'fan') {
    const axis = reveal.axisDeg ?? outward;
    const mid = (reveal.slots.length - 1) / 2;
    return reveal.slots.map((_, i) => axis + (i - mid) * reveal.spacingDeg);
  }
  return [];
}

/* ---- plaque geometry ---- */

export function pillWidth(label: string): number {
  return SAT_R * 2 + PILL_GAP + label.length * PILL_FONT * PILL_CHAR_EM + PILL_END;
}

/**
 * Which way a plaque unfurls: away from the node's center horizontally, so it
 * never reaches back across the core. Satellites sitting exactly on a vertical
 * axis have no horizontal side, so they fall back to the node's outward axis
 * and then to the right.
 */
export function pillDirection(node: NodeSpec, angleDeg: number): 1 | -1 {
  const c = Math.cos(rad(angleDeg));
  if (Math.abs(c) > 1e-9) return c > 0 ? 1 : -1;
  const o = Math.cos(rad(node.outward));
  if (Math.abs(o) > 1e-9) return o > 0 ? 1 : -1;
  return 1;
}

export function pillRect(at: Pt, label: string, dir: 1 | -1) {
  const w = pillWidth(label);
  return {
    x: dir === 1 ? at.x - SAT_R : at.x + SAT_R - w,
    y: at.y - PILL_H / 2,
    w,
    h: PILL_H,
  };
}

/**
 * The capsule is always drawn growing to the right from the satellite, and
 * mirrored in CSS when it should grow left. That keeps one animating property
 * — width — instead of having to keep x and width in sync.
 */
export function capsuleRect(at: Pt) {
  return { x: at.x - SAT_R, y: at.y - SAT_R, closed: SAT_R * 2, rx: SAT_R };
}

/** Where a plaque's text starts, and which way it runs from there. */
export function pillTextAnchor(at: Pt, dir: 1 | -1) {
  return {
    x: at.x + dir * (SAT_R + PILL_GAP),
    y: at.y,
    anchor: dir === 1 ? ('start' as const) : ('end' as const),
  };
}

/* ---- derived frame ---- */

const union = (boxes: Box[]): Box => ({
  minX: Math.min(...boxes.map((b) => b.minX)),
  maxX: Math.max(...boxes.map((b) => b.maxX)),
  minY: Math.min(...boxes.map((b) => b.minY)),
  maxY: Math.max(...boxes.map((b) => b.maxY)),
});

const around = (p: Pt, rx: number, ry = rx): Box => ({
  minX: p.x - rx, maxX: p.x + rx, minY: p.y - ry, maxY: p.y + ry,
});

/**
 * Everything a node can paint, as a box relative to the centroid — including
 * plaques, which only ever open one at a time but must all fit.
 *
 * Measured from the centroid rather than from CENTER because CENTER is
 * derived from this. Deriving the frame instead of hand-picking it is what
 * keeps the figure from clipping when any constant changes.
 */
/**
 * The whole-number values to label. The slider still moves in `step`
 * increments — halves are draggable, just not written on the bar.
 */
export function dialTicks(dial: { min: number; max: number }): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(dial.min); v <= dial.max; v++) out.push(v);
  return out;
}

/** Outer edge of the dial's rim, and the radius its labels sit at. */
export const dialReach = () => ARC_R + (ARC_WIDTH + ARC_RIM_EXTRA) / 2;
export const dialLabelR = () => dialReach() + DIAL_LABEL_OFFSET;

function nodeBox(node: NodeSpec): Box {
  const c = polar({ x: 0, y: 0 }, TRIANGLE_R, node.outward);
  const boxes: Box[] = [around(c, NODE_R * NODE_HOVER_SCALE + STROKE / 2)];

  const angles = satelliteAngles(node);
  if (node.reveal.kind !== 'dial') {
    node.reveal.slots.forEach((slot, i) => {
      const at = polar(c, SAT_ORBIT, angles[i]);
      boxes.push(around(at, SAT_R + STROKE / 2));
      const r = pillRect(at, slot.label, pillDirection(node, angles[i]));
      const pad = STROKE / 2;
      boxes.push({
        minX: r.x - pad, maxX: r.x + r.w + pad,
        minY: r.y - pad, maxY: r.y + r.h + pad,
      });
    });
  } else {
    const reach = dialReach();
    const labelR = dialLabelR();
    const axis = node.reveal.axisDeg ?? node.outward;
    // sample the sweep rather than assume which extreme is widest
    for (let i = 0; i <= 360; i++) {
      const deg = axis - ARC_SPAN / 2 + (i * ARC_SPAN) / 360;
      boxes.push(around(polar(c, reach, deg), 0));
    }
    for (const v of dialTicks(node.reveal)) {
      const frac = (v - node.reveal.min) / (node.reveal.max - node.reveal.min);
      const deg = axis - ARC_SPAN / 2 + frac * ARC_SPAN;
      boxes.push(around(polar(c, labelR, deg), DIAL_TICK_FONT * 0.6));
    }
  }
  return union(boxes);
}

/* ---- day navigation chrome ---- */

/** Chevrons: two strokes meeting at a point, no stem. */
export const ARROW_HALF_W = 24;
export const ARROW_HALF_H = 46;
export const ARROW_STROKE = 14;
/** Clear space between the figure and each chevron. */
const ARROW_GAP = 46;
/** Transparent padding around a chevron, so it is comfortable to hit. */
export const ARROW_HIT_PAD = 26;

export const DATE_FONT = 44;
/** Drop below the figure to the date line. */
const DATE_GAP = 56;
/** Longest the date line gets, e.g. "Wednesday, Sept. 11, 2026". */
const DATE_MAX_CHARS = 25;

/*
 * The chrome is placed relative to the NODES' own extents, then folded into
 * the frame — rather than relative to the frame, which would be circular.
 */
const NODE_EXT = union(NODES.map(nodeBox));

/*
 * The figure is NOT symmetric about the centroid — the eating capsules reach
 * far further left than anything reaches right — so its bounding box is
 * skewed. Centring the chrome on that box puts it off-centre relative to the
 * triangle, which is what reads as misaligned. Mirroring the wider side gives
 * a box the triangle genuinely sits in the middle of, and since every box
 * below is then symmetric about x = 0, CENTER.x lands exactly on VIEW.w / 2.
 */
const CONTENT_HALF_W = Math.max(-NODE_EXT.minX, NODE_EXT.maxX);

const DATE_Y = NODE_EXT.maxY + DATE_GAP;
const DATE_HALF_W = (DATE_MAX_CHARS * DATE_FONT * PILL_CHAR_EM) / 2;
const DATE_HALF_H = DATE_FONT * 0.7;

/** Everything drawn, so the chevrons can sit at its true vertical middle. */
const CONTENT: Box = {
  minX: -CONTENT_HALF_W,
  maxX: CONTENT_HALF_W,
  minY: NODE_EXT.minY,
  maxY: DATE_Y + DATE_HALF_H,
};

/*
 * Vertically centred on everything drawn, the date line included — centring
 * on the nodes alone left the chevrons sitting visibly high.
 */
const ARROW_Y = (CONTENT.minY + CONTENT.maxY) / 2;
const ARROW_X = CONTENT_HALF_W + ARROW_GAP + ARROW_HALF_W;

const ARROW_REACH_X = ARROW_HALF_W + ARROW_STROKE / 2 + ARROW_HIT_PAD;
const ARROW_REACH_Y = ARROW_HALF_H + ARROW_STROKE / 2 + ARROW_HIT_PAD;

const EXTENTS = union([
  CONTENT,
  around({ x: 0, y: DATE_Y }, DATE_HALF_W, DATE_HALF_H),
  around({ x: -ARROW_X, y: ARROW_Y }, ARROW_REACH_X, ARROW_REACH_Y),
  around({ x: ARROW_X, y: ARROW_Y }, ARROW_REACH_X, ARROW_REACH_Y),
]);

export const VIEW = {
  w: EXTENTS.maxX - EXTENTS.minX + 2 * MARGIN,
  h: EXTENTS.maxY - EXTENTS.minY + 2 * MARGIN,
};

/** Centroid of the triangle, placed so the derived extents sit inside. */
export const CENTER: Pt = {
  x: -EXTENTS.minX + MARGIN,
  y: -EXTENTS.minY + MARGIN,
};

/** Absolute positions of the chrome, now that CENTER is known. */
export const ARROWS = {
  y: CENTER.y + ARROW_Y,
  leftX: CENTER.x - ARROW_X,
  rightX: CENTER.x + ARROW_X,
};

/** On the centroid, which the symmetric content box puts at the frame's middle. */
export const DATE_POS: Pt = { x: CENTER.x, y: CENTER.y + DATE_Y };

/** A bare chevron: back corner, point, back corner. dir 1 points right. */
export function chevron(cx: number, cy: number, dir: 1 | -1): string {
  const back = cx - dir * ARROW_HALF_W;
  const tip = cx + dir * ARROW_HALF_W;
  return `M ${back} ${cy - ARROW_HALF_H} L ${tip} ${cy} L ${back} ${cy + ARROW_HALF_H}`;
}

/** Where a node sits: straight out from the centroid along its outward axis. */
export function nodeCenter(node: NodeSpec): Pt {
  return polar(CENTER, TRIANGLE_R, node.outward);
}

/** Generous hover target: covers the node plus everything it reveals. */
export const HIT_R = FOOTPRINT;

/* ---- dial maths ---- */

type Dial = Extract<Reveal, { kind: 'dial' }>;

/**
 * Where a dial sits before it holds a value. Parking the knob midway reads as
 * "nothing chosen yet" rather than as a logged zero, which an empty bar would
 * be indistinguishable from. Snapped to the step so it lines up with the
 * positions dragging can actually produce.
 */
export function dialUnset(dial: Dial): number {
  const raw = dial.unsetAt ?? (dial.min + dial.max) / 2;
  return Math.round(raw / dial.step) * dial.step;
}

/** The axis a dial is centered on: its own, or the node's outward direction. */
export function dialAxis(node: NodeSpec, dial: Dial): number {
  return dial.axisDeg ?? node.outward;
}

/** The dial sweeps symmetrically about its axis. */
export function dialArc(node: NodeSpec, dial: Dial) {
  const axis = dialAxis(node, dial);
  return { start: axis - ARC_SPAN / 2, end: axis + ARC_SPAN / 2 };
}

/** Where a value sits along the sweep, as 0..1 from the start angle. */
export function valueFraction(dial: Dial, value: number): number {
  return (value - dial.min) / (dial.max - dial.min);
}

export function valueAngle(node: NodeSpec, dial: Dial, value: number): number {
  return dialAxis(node, dial) - ARC_SPAN / 2 + valueFraction(dial, value) * ARC_SPAN;
}

/**
 * Turn a pointer bearing into a dial value.
 *
 * A sweep can straddle 0deg depending on its axis, so the bearing is
 * unwrapped relative to that axis into -180..180 before clamping. Comparing
 * raw 0..360 angles would break across the seam.
 */
export function angleToValue(node: NodeSpec, dial: Dial, deg: number): number {
  const half = ARC_SPAN / 2;
  const delta = ((((deg - dialAxis(node, dial)) % 360) + 540) % 360) - 180;
  const clamped = Math.min(half, Math.max(-half, delta));
  const raw = dial.min + ((clamped + half) / ARC_SPAN) * (dial.max - dial.min);
  const stepped = Math.round(raw / dial.step) * dial.step;
  // step may not divide the range evenly, so clamp after snapping
  return Math.min(dial.max, Math.max(dial.min, stepped));
}
