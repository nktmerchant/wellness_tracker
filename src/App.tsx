import { useState, useSyncExternalStore } from 'react';
import Account, { LoadFailed, Loading, NotConfigured, SignIn } from './Account';
import { getStatus, subscribeStatus } from './sync';
import TriangleNodes from './TriangleNodes';
import TrendsModal from './TrendsModal';
import { VIEW, ZOOM } from './geometry';
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
      style={{ '--ratio': VIEW.w / VIEW.h, '--zoom': ZOOM } as React.CSSProperties}
    >
      <TriangleNodes
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
      <Account />
    </main>
  );
}
