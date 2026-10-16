import { useEffect, useState } from 'react';
import { SHARE_SHEET, dayShare, sendShare } from './share';

/** How long "Copied" stays before the pill goes back to its label. */
const CONFIRM_MS = 1800;

/**
 * The shown day as text, as a quiet pill in the top-right corner, mirroring
 * the account pill opposite. The text is built at the tap, so it is always
 * the day on screen as it stands.
 */
export default function ShareButton({ date }: { date: string }) {
  const [done, setDone] = useState<'Copied' | 'Shared' | "Couldn't copy" | null>(null);

  /* A timer is an external system: this only clears the confirmation. */
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      className={`share-pill${done ? ' is-done' : ''}`}
      onClick={() => {
        sendShare(dayShare(date)).then(
          (r) => r && setDone(r === 'shared' ? 'Shared' : 'Copied'),
          () => setDone("Couldn't copy"),
        );
      }}
    >
      <span aria-live="polite">{done ?? (SHARE_SHEET ? 'Share' : 'Copy')}</span>
    </button>
  );
}
