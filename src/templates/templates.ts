import type { TemplateId } from '../lib/types';

export interface Template {
  id: TemplateId;
  label: string;
  icon: string; // emoji glyph used in chips + PDF header
  color: string; // hex accent, used for chip + PDF styling
  // Guidance injected into the Claude prompt.
  focus: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'general',
    label: 'General Notes',
    icon: '📝',
    color: '#4f8cff',
    focus: 'Organize into topics, key points, and next steps.',
  },
  {
    id: 'interview',
    label: 'Interview',
    icon: '🎤',
    color: '#a855f7',
    focus: 'Capture questions asked, the answers given, and follow-up questions to ask.',
  },
  {
    id: 'meeting',
    label: 'Meeting Notes',
    icon: '👥',
    color: '#10b981',
    focus: 'Capture attendees, agenda items, decisions made, and action items with owners.',
  },
  {
    id: 'journal',
    label: 'Voice Journal',
    icon: '📔',
    color: '#f59e0b',
    focus: 'Identify recurring themes, the overall mood, and open loops or unresolved thoughts.',
  },
  {
    id: 'standup',
    label: 'Standup',
    icon: '🏃',
    color: '#ef4444',
    focus: 'Structure strictly as: what was done yesterday, what is planned today, and any blockers.',
  },
  {
    id: 'idea',
    label: 'Idea Dump',
    icon: '💡',
    color: '#eab308',
    focus: 'Extract raw ideas, interesting phrases worth keeping verbatim, and connections to explore.',
  },
];

export const TEMPLATE_MAP: Record<TemplateId, Template> = TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<TemplateId, Template>,
);

export function getTemplate(id: TemplateId): Template {
  return TEMPLATE_MAP[id] ?? TEMPLATE_MAP.general;
}
