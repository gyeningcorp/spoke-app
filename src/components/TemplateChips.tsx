import { TEMPLATES } from '../templates/templates';
import type { TemplateId } from '../lib/types';

interface TemplateChipsProps {
  selected: TemplateId;
  onSelect: (id: TemplateId) => void;
}

// Horizontally scrolling template selector chips.
export function TemplateChips({ selected, onSelect }: TemplateChipsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '4px 2px 8px',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {TEMPLATES.map((t) => {
        const active = t.id === selected;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-pressed={active}
            style={{
              flex: '0 0 auto',
              height: 40,
              minHeight: 40,
              minWidth: 0,
              padding: '0 14px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: `2px solid ${active ? t.color : 'var(--border)'}`,
              background: active ? t.color : 'var(--bg-elev)',
              color: active ? '#fff' : 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
