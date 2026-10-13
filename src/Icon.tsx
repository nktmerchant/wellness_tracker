import { STROKE, type Pt } from './geometry';
import { ICONS, type IconName } from './icons';

/**
 * An icon body mapped onto a box, via a nested svg rather than a transform —
 * the viewBox does the scaling, so no factor has to be computed here.
 *
 * Sets do not share a grid (MDI is 24, Temaki is 50), so the viewBox comes
 * from the icon itself. --icon-stroke converts the figure's outline weight
 * into that grid's units, so an outlined icon keeps the same apparent weight
 * whatever set it came from. The default preserveAspectRatio is "meet", which
 * scales by the larger dimension.
 */
export default function Icon({
  name,
  at,
  box,
  className,
}: {
  name: IconName;
  at: Pt;
  box: number;
  className: string;
}) {
  const icon = ICONS[name];
  const scale = box / Math.max(icon.w, icon.h);

  return (
    <svg
      className={className}
      x={at.x - box / 2}
      y={at.y - box / 2}
      width={box}
      height={box}
      viewBox={`0 0 ${icon.w} ${icon.h}`}
      style={{ '--icon-stroke': STROKE / scale } as React.CSSProperties}
      aria-hidden="true"
      /* Build-time constant from icons.ts, never user input. */
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
