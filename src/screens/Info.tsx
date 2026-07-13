import { useEffect, useState } from 'react';
import { PLANS, CURRENT_PLAN_VERSION } from '../lib/plans';
import { loadAuth } from '../lib/auth';
import type { AuthState } from '../lib/types';

interface InfoProps {
  minutesRemaining: number;
  onBack: () => void;
  onUpgrade: () => void;
}

export function Info({ minutesRemaining, onBack, onUpgrade }: InfoProps) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const plan = PLANS[CURRENT_PLAN_VERSION];

  useEffect(() => {
    loadAuth().then(setAuth);
  }, []);

  return (
    <div className="app">
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 0' }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize: 20, padding: '0 12px' }}>
          ‹ Back
        </button>
      </div>
      <div style={{ padding: '8px 20px 24px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>VoiceNotes</h1>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Record. Tap Outline or Summarize. Get clean, structured notes. Export to PDF, copy, or share.
          Everything is stored on your device; audio never leaves without you asking.
        </p>

        <div
          style={{
            background: 'var(--bg-elev)',
            borderRadius: 16,
            padding: 16,
            marginTop: 16,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Plan</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {auth?.tier === 'pro' ? 'Pro' : 'Free'}
          </div>
          <div style={{ marginTop: 8, fontSize: 15 }}>
            {Math.max(0, Math.round(minutesRemaining))} minutes remaining
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Free: {plan.free_minutes} min/month · Pro: {plan.pro_minutes.toLocaleString()} min/month
          </div>
          {auth?.tier !== 'pro' && (
            <button
              onClick={onUpgrade}
              style={{
                marginTop: 14,
                width: '100%',
                height: 52,
                borderRadius: 14,
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              Upgrade to Pro — ${plan.pro_monthly}/mo
            </button>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 20 }}>
          Device ID: {auth?.deviceId?.slice(0, 12)}…
        </p>
      </div>
    </div>
  );
}
