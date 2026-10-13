import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getStatus, load, save, signIn, signOut, subscribeStatus, type Status } from './sync';

function summary(s: Status): string {
  if (s.save === 'error') return 'Not saved';
  if (s.save === 'saving' || s.pending) return 'Saving…';
  return 'Saved';
}

/** The corner control: save state, and the way to sign out. */
export default function Account() {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const state = status.save === 'error' ? 'error' : status.pending ? 'saving' : 'saved';

  return (
    <>
      <button
        type="button"
        className={`account-chip is-${state}`}
        onClick={() => setOpen(true)}
      >
        <span className="account-dot" aria-hidden="true" />
        {summary(status)}
      </button>

      <dialog
        ref={ref}
        className="account"
        aria-label="Account"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="account-head">
          <h2>Account</h2>
          <button
            type="button"
            className="trends-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="account-body">
          <p>
            Signed in as <strong>{status.email}</strong>
          </p>
          <p className="account-status">
            {summary(status)}
            {status.saveError && <span className="account-error"> — {status.saveError}</span>}
          </p>
          <div className="account-actions">
            {status.save === 'error' && (
              <button type="button" onClick={() => void save()}>
                Try again
              </button>
            )}
            <button
              type="button"
              className="is-quiet"
              onClick={() => {
                if (
                  status.pending &&
                  !confirm('Some changes haven’t been saved yet and will be lost. Sign out anyway?')
                )
                  return;
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** A full-page card, for everything shown before the log is ready. */
function GateCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="gate">
      <section className="account" aria-label={title}>
        <div className="account-head">
          <h2>{title}</h2>
        </div>
        <div className="account-body">{children}</div>
      </section>
    </main>
  );
}

export function NotConfigured() {
  return (
    <GateCard title="Not set up">
      <p>
        This build has no Supabase settings. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> and build again.
      </p>
    </GateCard>
  );
}

export function Loading() {
  return (
    <GateCard title="Loading">
      <p className="account-status">Loading your log…</p>
    </GateCard>
  );
}

export function LoadFailed({ error }: { error: string | null }) {
  return (
    <GateCard title="Can’t reach the server">
      <p>
        Your log lives online, so the app needs a connection.
        {error && <span className="account-error"> ({error})</span>}
      </p>
      <div className="account-actions">
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
        <button type="button" className="is-quiet" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </GateCard>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <GateCard title="Sign in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="email"
          required
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="account-error">{error}</p>}
        <div className="account-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </GateCard>
  );
}
