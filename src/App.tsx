import { useState } from 'react';
import Account from './Account';
import TriangleNodes from './TriangleNodes';
import TrendsModal from './TrendsModal';
import { VIEW, ZOOM } from './geometry';
import { startOfWeek, todayISO, useDayLog } from './useDayLog';
import './styles.css';

export default function App() {
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
