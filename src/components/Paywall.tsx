import { useState } from 'react';
import { PLANS, CURRENT_PLAN_VERSION } from '../lib/plans';
import { createCheckout } from '../lib/api';

interface PaywallProps {
  open: boolean;
  onClose: () => void;
}

// Shown when a free user hits 0 minutes and taps Outline/Summarize.
export function Paywall({ open, onClose }: PaywallProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const plan = PLANS[CURRENT_PLAN_VERSION];

  if (!open) return null;

  const upgrade = async () => {
    setErr(null);
    if (!email.includes('@')) {
      setErr('Enter a valid email');
      return;
    }
    setBusy(true);
    try {
      const { url } = await createCheckout(email);
      // Open Stripe Checkout in the web view / external browser.
      window.location.href = url;
    } catch (e: any) {
      setErr(e?.message || 'Could not start checkout');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 1000,
      }}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          width: '100%',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: '24px 20px calc(24px + var(--safe-bottom))',
          boxShadow: '0 -8px 30px var(--shadow)',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Go Pro</div>
        <p style={{ color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.4 }}>
          Pro is ${plan.pro_monthly}/mo. {plan.pro_minutes.toLocaleString()} minutes. Unlimited templates & PDF.
        </p>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-elev)',
            color: 'var(--text)',
            padding: '0 14px',
            fontSize: 16,
            marginBottom: 12,
          }}
        />
        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button
          onClick={upgrade}
          disabled={busy}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 14,
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            fontSize: 17,
            fontWeight: 700,
          }}
        >
          {busy ? <span className="spinner" /> : `Upgrade — $${plan.pro_monthly}/mo`}
        </button>
        <button onClick={onClose} style={{ width: '100%', height: 48, color: 'var(--text-dim)', marginTop: 6 }}>
          Not now
        </button>
      </div>
    </div>
  );
}
