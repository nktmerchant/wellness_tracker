import { useEffect, useRef } from 'react';
import Icon from './Icon';
import {
  CATALOG,
  GROUPS,
  MAX_EXERCISES,
  setExercises,
  useTodaysExercises,
  type Exercise,
} from './exercises';

/** Icons are drawn in a small svg of their own, so they size like text. */
const ICON = 20;

/**
 * Settings, in the same frame as the trends view. One setting so far: which
 * exercises go around the exercise node, from today on; earlier days keep
 * theirs. Each change shows on the figure at once and is saved with the
 * account a moment later.
 */
export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ids = useTodaysExercises();
  const full = ids.length >= MAX_EXERCISES;

  /* <dialog> owns focus trapping and Escape; React just syncs it open/shut. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /* The ring keeps catalog order, whatever order they're ticked in. The
     last one can't be unticked: the node needs something to tap. */
  const toggle = (id: string) => {
    if (ids.includes(id)) {
      if (ids.length > 1) setExercises(ids.filter((x) => x !== id));
    } else if (!full) {
      setExercises([...ids, id]);
    }
  };

  return (
    <dialog
      ref={ref}
      className="trends settings"
      aria-label="Settings"
      onClose={onClose}
      /* Clicking the backdrop reports the dialog itself as the target. */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="trends-head">
        <h2 className="settings-title">Settings</h2>
        <button type="button" className="trends-close" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>

      <div className="trends-body settings-body">
        <section aria-labelledby="settings-exercises">
          <div className="settings-section-head">
            <h3 id="settings-exercises">Exercises</h3>
            <span className="settings-count" aria-label={`${ids.length} of ${MAX_EXERCISES} picked`}>
              {ids.length}/{MAX_EXERCISES}
            </span>
          </div>

          <div className="settings-tables">
            {GROUPS.map((group) => (
              <table key={group} className="settings-table">
                <thead>
                  <tr>
                    <th scope="col">{group}</th>
                  </tr>
                </thead>
                <tbody>
                  {CATALOG.filter((e) => e.group === group).map((e) => {
                    const on = ids.includes(e.id);
                    return (
                      <tr key={e.id}>
                        <td>
                          <label className={on ? 'is-on' : undefined}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={on ? ids.length === 1 : full}
                              onChange={() => toggle(e.id)}
                            />
                            <ExerciseIcon e={e} />
                            {e.label}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  );
}

function ExerciseIcon({ e }: { e: Exercise }) {
  return (
    <svg className="settings-icon" viewBox={`0 0 ${ICON} ${ICON}`} aria-hidden="true">
      <Icon name={e.icon} at={{ x: ICON / 2, y: ICON / 2 }} box={ICON} className="" />
    </svg>
  );
}
