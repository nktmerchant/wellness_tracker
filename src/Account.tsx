import { useState, useSyncExternalStore } from 'react';
import { getStatus, load, save, signIn, signOut, subscribeStatus } from './sync';

/**
 * Saving is silent; this corner notice appears only while a save is failing,
 * so an edit that hasn't reached the server is never shown as if it had.
 */
export default function SaveNotice() {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  if (status.save !== 'error') return null;
  return (
    <div className="save-notice" role="alert">
      <span className="save-dot" aria-hidden="true" />
      <span title={status.saveError ?? undefined}>Not saved</span>
      <button type="button" onClick={() => void save()}>
        Try again
      </button>
    </div>
  );
}

/**
 * Who's signed in, as a quiet pill in the top-left corner. Tapping it offers
 * the way out, so a stray tap can't sign anyone out.
 */
export function AccountPill() {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  const [open, setOpen] = useState(false);
  return (
    <div className={`account-pill${open ? ' is-open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {status.email}
      </button>
      {open && (
        <button
          type="button"
          className="account-signout"
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
      )}
    </div>
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
