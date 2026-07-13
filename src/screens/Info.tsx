import { useEffect, useState } from 'react';
import { PLANS, CURRENT_PLAN_VERSION } from '../lib/plans';
import { loadAuth } from '../lib/auth';
import { getGeminiKey, getClaudeKey, setGeminiKey, setClaudeKey, clearDirectKeys } from '../lib/directApi';
import type { AuthState } from '../lib/types';

const USE_DIRECT = !(import.meta.env.VITE_PROXY_URL as string | undefined);

interface InfoProps {
  minutesRemaining: number;
  onBack: () => void;
  onUpgrade: () => void;
}

export function Info({ minutesRemaining, onBack, onUpgrade }: InfoProps) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [geminiKey, setGeminiKeyState] = useState('');
  const [claudeKey, setClaudeKeyState] = useState('');
  const [saved, setSaved] = useState(false);
  const plan = PLANS[CURRENT_PLAN_VERSION];

  useEffect(() => {
    loadAuth().then(setAuth);
    if (USE_DIRECT) {
      setGeminiKeyState(getGeminiKey());
      setClaudeKeyState(getClaudeKey());
    }
  }, []);

  function saveKeys() {
    setGeminiKey(geminiKey.trim());
    setClaudeKey(claudeKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function clearKeys() {
    clearDirectKeys();
    setGeminiKeyState('');
    setClaudeKeyState('');
  }

  return (
    <div className="app">
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 0' }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize: 20, padding: '0 12px' }}>
          ‹ Back
        </button>
      </div>
      <div style={{ padding: '8px 20px 24px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>Spoke</h1>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Record. Tap Outline or Summarize. Get clean, structured notes. Export to PDF, copy, or share.
        </p>

        {USE_DIRECT && (
          <div style={{ background: 'var(--bg-elev)', borderRadius: 16, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>API Keys</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
              Keys are saved to this device only and never shared.
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Gemini API Key
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={e => setGeminiKeyState(e.target.value)}
              placeholder="AIza..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1.5px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Anthropic (Claude) API Key
            </label>
            <input
              type="password"
              value={claudeKey}
              onChange={e => setClaudeKeyState(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1.5px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <button
              onClick={saveKeys}
              disabled={!geminiKey.trim() || !claudeKey.trim()}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 12,
                background: saved ? '#22c55e' : 'var(--accent)',
                color: 'var(--accent-text)',
                fontWeight: 700,
                fontSize: 15,
                transition: 'background 0.2s',
              }}
            >
              {saved ? 'Saved ✓' : 'Save Keys'}
            </button>

            {(getGeminiKey() || getClaudeKey()) && (
              <button
                onClick={clearKeys}
                style={{
                  width: '100%',
                  height: 40,
                  borderRadius: 12,
                  background: 'transparent',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: 14,
                  marginTop: 8,
                }}
              >
                Clear Keys
              </button>
            )}
          </div>
        )}

        <div style={{ background: 'var(--bg-elev)', borderRadius: 16, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Plan</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {USE_DIRECT ? 'Direct Mode' : auth?.tier === 'pro' ? 'Pro' : 'Free'}
          </div>
          <div style={{ marginTop: 8, fontSize: 15 }}>
            {USE_DIRECT
              ? 'Unlimited (using your own keys)'
              : `${Math.max(0, Math.round(minutesRemaining))} minutes remaining`}
          </div>
          {!USE_DIRECT && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
              Free: {plan.free_minutes} min/month · Pro: {plan.pro_minutes.toLocaleString()} min/month
            </div>
          )}
          {!USE_DIRECT && auth?.tier !== 'pro' && (
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
