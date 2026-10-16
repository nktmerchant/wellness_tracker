import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ICONS, type IconName } from './icons';
import { dayShare, sendShare } from './share';
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

/** How long "Copied" shows before the menu closes. */
const CONFIRM_MS = 1800;

/**
 * Who's signed in, as a quiet pill in the top-left corner. Tapping it opens a
 * small menu: share the shown day, open settings, or log out. Logging out sits behind the
 * tap, so a stray one can't sign anyone out.
 */
export function AccountMenu({ date, onOpenSettings }: { date: string; onOpenSettings: () => void }) {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'Copied' | 'Shared' | "Couldn't copy" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  /* Outside taps and Escape close it, as any menu would. */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  /* A timer is an external system: this only clears the confirmation. */
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setDone(null);
      setOpen(false);
    }, CONFIRM_MS);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <div ref={ref} className={`account-menu${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="account-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="account-email">{status.email}</span>
        <svg className="account-caret" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M 3 4.5 L 6 7.5 L 9 4.5" />
        </svg>
      </button>
      {open && (
        <div className="account-list" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              /* The text is built at the tap, so it is the day on screen. */
              sendShare(dayShare(date)).then(
                (r) => (r ? setDone(r === 'shared' ? 'Shared' : 'Copied') : setOpen(false)),
                () => setDone("Couldn't copy"),
              );
            }}
          >
            <MenuIcon name="share" />
            <span aria-live="polite">{done ?? 'Share'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <MenuIcon name="settings" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (
                status.pending &&
                !confirm('Some changes haven’t been saved yet and will be lost. Log out anyway?')
              )
                return;
              void signOut();
            }}
          >
            <MenuIcon name="logOut" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** A menu icon from icons.ts, sized by CSS like the text beside it. */
function MenuIcon({ name }: { name: IconName }) {
  const icon = ICONS[name];
  return (
    <svg
      className="menu-icon"
      viewBox={`0 0 ${icon.w} ${icon.h}`}
      aria-hidden="true"
      /* Build-time constant from icons.ts, never user input. */
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
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
