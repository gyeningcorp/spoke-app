import { useEffect, useState } from 'react';
import { Home } from './screens/Home';
import { Detail } from './screens/Detail';
import { Info } from './screens/Info';
import { Paywall } from './components/Paywall';
import { loadAuth } from './lib/auth';
import { validateSubscription } from './lib/api';
import { PLANS, CURRENT_PLAN_VERSION } from './lib/plans';

type Route = { name: 'home' } | { name: 'detail'; id: string } | { name: 'info' };

// Two-screen app (Home + Detail) plus an Info sheet. No router library needed.
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [minutes, setMinutes] = useState<number>(PLANS[CURRENT_PLAN_VERSION].free_minutes);
  const [paywall, setPaywall] = useState(false);

  // On boot: load device auth, then refresh quota/tier from the server (best effort).
  useEffect(() => {
    (async () => {
      const auth = await loadAuth();
      const plan = PLANS[CURRENT_PLAN_VERSION];
      setMinutes(auth.tier === 'pro' ? plan.pro_minutes : plan.free_minutes);
      try {
        const sub = await validateSubscription();
        setMinutes(sub.minutesRemaining);
      } catch {
        // Offline / not yet deployed — keep local estimate.
      }
    })();
  }, []);

  if (route.name === 'detail') {
    return (
      <Detail
        id={route.id}
        onBack={() => setRoute({ name: 'home' })}
        onQuotaChange={setMinutes}
      />
    );
  }

  if (route.name === 'info') {
    return (
      <>
        <Info
          minutesRemaining={minutes}
          onBack={() => setRoute({ name: 'home' })}
          onUpgrade={() => setPaywall(true)}
        />
        <Paywall open={paywall} onClose={() => setPaywall(false)} />
      </>
    );
  }

  return (
    <Home
      minutesRemaining={minutes}
      onOpen={(id) => setRoute({ name: 'detail', id })}
      onInfo={() => setRoute({ name: 'info' })}
    />
  );
}
