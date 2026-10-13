import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getStatus,
  signIn,
  signOut,
  subscribeStatus,
  sync,
  type SyncStatus,
} from './sync';

/** "just now", "5 min ago", "3 h ago" — sync freshness doesn't need more. */
function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

function summary(s: SyncStatus): string {
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error') return 'Sync failed';
  if (s.state === 'offline') return s.pending ? `Offline · ${s.pending} to sync` : 'Offline';
  if (s.pending) return `${s.pending} to sync`;
  return s.lastSynced ? `Synced ${ago(s.lastSynced)}` : 'Synced';
}

/**
 * The corner control for sign-in and sync. Absent in a local-only build, so
 * an unconfigured deploy looks exactly like the app did before sync.
 */
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

  if (!status.configured) return null;

  const signedIn = status.email !== null;

  return (
    <>
      <button
        type="button"
        className={`account-chip is-${signedIn ? status.state : 'signed-out'}`}
        onClick={() => setOpen(true)}
      >
        <span className="account-dot" aria-hidden="true" />
        {signedIn ? summary(status) : 'Sign in to sync'}
      </button>

      <dialog
        ref={ref}
        className="account"
        aria-label="Account and sync"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="account-head">
          <h2>{signedIn ? 'Sync' : 'Sign in'}</h2>
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
          {signedIn ? <SignedIn status={status} /> : <SignIn />}
        </div>
      </dialog>
    </>
  );
}

function SignedIn({ status }: { status: SyncStatus }) {
  return (
    <>
      <p>
        Signed in as <strong>{status.email}</strong>
      </p>
      <p className="account-status">
        {summary(status)}
        {status.error && <span className="account-error"> — {status.error}</span>}
      </p>
      <div className="account-actions">
        <button type="button" onClick={() => void sync()} disabled={status.state === 'syncing'}>
          Sync now
        </button>
        <button type="button" className="is-quiet" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <p className="account-note">
        Your log is kept on this device and backed up to your account, so it
        survives deleting the app and appears on any device you sign in on.
      </p>
    </>
  );
}

function SignIn() {
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
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
