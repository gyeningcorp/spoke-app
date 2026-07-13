import type { StructuredResult } from '../lib/types';

interface ResultViewProps {
  result: StructuredResult;
  accent: string;
}

// Clean, readable render of the structured Claude result. Fades in on mount.
export function ResultView({ result, accent }: ResultViewProps) {
  const hasSections = result.sections && result.sections.length > 0;

  return (
    <div className="fade-in" style={{ marginTop: 16 }}>
      {!hasSections && result.raw && (
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 16 }}>{result.raw}</p>
      )}

      {hasSections &&
        result.sections.map((section, i) => (
          <section key={i} style={{ marginBottom: 20 }}>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 700,
                margin: '0 0 8px',
                color: accent,
                borderLeft: `3px solid ${accent}`,
                paddingLeft: 10,
              }}
            >
              {section.heading}
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.55 }}>
              {section.bullets.map((b, j) => (
                <li key={j} style={{ marginBottom: 4, fontSize: 16 }}>
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ))}

      {result.action_items && result.action_items.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', color: accent }}>Action Items</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {result.action_items.map((a, i) => (
              <li
                key={i}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, fontSize: 16 }}
              >
                <span aria-hidden style={{ color: accent, fontSize: 18, lineHeight: 1.2 }}>
                  ☐
                </span>
                <span>
                  {a.task}
                  {a.owner && <em style={{ color: 'var(--text-dim)' }}> — {a.owner}</em>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
