import { useSyncExternalStore } from 'react';

/**
 * Phone-width screens get the compact layouts (geometry.ts FRAMES, the
 * trends grid). Kept in step with the max-width media queries in styles.css.
 */
const QUERY = '(max-width: 640px)';

const mql = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null;

function subscribe(onChange: () => void): () => void {
  mql?.addEventListener('change', onChange);
  return () => mql?.removeEventListener('change', onChange);
}

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => mql?.matches ?? false);
}
