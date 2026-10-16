import { useState, useSyncExternalStore } from 'react';
import SaveNotice, { AccountPill, LoadFailed, Loading, NotConfigured, SignIn } from './Account';
import ShareButton from './ShareButton';
import { getStatus, subscribeStatus } from './sync';
import TriangleNodes from './TriangleNodes';
import TrendsModal from './TrendsModal';
import { FRAMES } from './geometry';
import { useCompact } from './useCompact';
import { startOfWeek, todayISO, useDayLog } from './useDayLog';
import './styles.css';

/**
 * Nothing of the log is shown until it has loaded from the server: signed
 * out, the whole page is the sign-in form.
 */
export default function App() {
  const status = useSyncExternalStore(subscribeStatus, getStatus);
  if (!status.configured) return <NotConfigured />;
  if (status.auth === 'checking') return null;
  if (status.auth === 'signed-out') return <SignIn />;
  if (status.load === 'loading') return <Loading />;
  if (status.load === 'error') return <LoadFailed error={status.loadError} />;
  /* Mounted only now, so a fresh load starts on today's date. */
  return <Tracker />;
}

function Tracker() {
  const { date, log, toggle, setSleepHours, goDays, canGoBack, canGoForward } = useDayLog();
  const frame = FRAMES[useCompact() ? 'compact' : 'wide'];
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [trendsWeek, setTrendsWeek] = useState(() => startOfWeek(todayISO()));

  /* Set the week from the event that opens the view, not from an effect. */
  const openTrends = () => {
    setTrendsWeek(startOfWeek(date));
    setTrendsOpen(true);
  };

  return (
    <main
      className="stage"
      /* The viewBox ratio and display zoom drive the layout, so CSS never
         hardcodes either. */
      style={{ '--ratio': frame.ratio, '--zoom': frame.zoom } as React.CSSProperties}
    >
      <TriangleNodes
        frame={frame}
        log={log}
        date={date}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoDays={goDays}
        onOpenTrends={openTrends}
        onToggle={toggle}
        onSetSleep={setSleepHours}
      />
      <TrendsModal
        open={trendsOpen}
        weekStart={trendsWeek}
        today={todayISO()}
        onWeekStart={setTrendsWeek}
        onClose={() => setTrendsOpen(false)}
      />
      <AccountPill />
      {/* Stacked, so a save warning never lands on top of the share pill. */}
      <div className="corner-right">
        <ShareButton date={date} />
        <SaveNotice />
      </div>
    </main>
  );
}
