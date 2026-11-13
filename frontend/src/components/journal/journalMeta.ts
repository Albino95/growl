import type { JournalMood } from '../../services/api/journal';

export const MOOD_META: Record<
  JournalMood,
  { label: string; glyph: string; color: string; wash: string }
> = {
  happy: { label: 'Happy', glyph: '😊', color: '#CA8A04', wash: '#FEF9C3' },
  excited: { label: 'Excited', glyph: '⚡', color: '#EA580C', wash: '#FFEDD5' },
  calm: { label: 'Calm', glyph: '😌', color: '#059669', wash: '#D1FAE5' },
  grateful: { label: 'Grateful', glyph: '💚', color: '#0D9488', wash: '#CCFBF1' },
  proud: { label: 'Proud', glyph: '🏆', color: '#B45309', wash: '#FEF3C7' },
  motivated: { label: 'Motivated', glyph: '🔥', color: '#DC2626', wash: '#FEE2E2' },
  peaceful: { label: 'Peaceful', glyph: '🌊', color: '#0284C7', wash: '#E0F2FE' },
  determined: { label: 'Determined', glyph: '💪', color: '#7C2D12', wash: '#FFEDD5' },
  tired: { label: 'Tired', glyph: '🌙', color: '#6366F1', wash: '#E0E7FF' },
  sad: { label: 'Sad', glyph: '\u{1F327}\u{FE0F}', color: '#64748B', wash: '#F1F5F9' },
  anxious: { label: 'Anxious', glyph: '💭', color: '#9333EA', wash: '#F3E8FF' },
};

export const PRIMARY_MOODS: JournalMood[] = [
  'calm',
  'grateful',
  'motivated',
  'happy',
  'tired',
  'anxious',
];

export const ALL_MOODS = Object.keys(MOOD_META) as JournalMood[];

const PROMPTS_BY_PATH: Record<string, string[]> = {
  fitness: [
    'What did your body teach you today?',
    'One rep, one walk, one choice — what counted?',
    'How did movement change your mood?',
  ],
  mindset: [
    'What belief softened or strengthened today?',
    'Where did you meet yourself with kindness?',
    'Name one thought you chose not to believe.',
  ],
  nutrition: [
    'How did food fuel (or drain) you today?',
    'What meal felt like care, not control?',
    'One nourishing choice you are proud of?',
  ],
  discipline: [
    'What tiny habit did you keep?',
    'Where did focus show up without forcing it?',
    'What would “done enough” look like tonight?',
  ],
  wellness: [
    'How is your energy — honestly?',
    'What would rest look like if it were allowed?',
    'One boundary that protected your peace?',
  ],
  default: [
    'What is one true thing about today?',
    'What are you growing toward this week?',
    'Capture a moment you do not want to forget.',
    'What went well — and what is still in progress?',
    'If today had a title, what would it be?',
  ],
};

export function promptForDay(date: Date, growthPath?: string | null): string {
  const key = growthPath && PROMPTS_BY_PATH[growthPath] ? growthPath : 'default';
  const list = PROMPTS_BY_PATH[key] || PROMPTS_BY_PATH.default;
  const seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  return list[seed % list.length];
}

/**
 * Device-local `YYYY-MM-DD` for a server timestamp. Server times are UTC, so a
 * late-evening entry in Luxembourg must land on the local day, not the UTC one.
 * Same algorithm as `localDayKey` in services/api/http.ts (kept here so this
 * module stays free of native imports for tests). SQLite-style
 * `YYYY-MM-DD HH:MM:SS` (no zone) is treated as UTC.
 */
export function dateKeyFromIso(iso: string): string {
  if (typeof iso !== 'string' || !iso) return '';
  let normalized = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
    normalized = `${normalized.replace(' ', 'T')}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return localDateKey(d);
}

/** Today check-in mood (1–5) → journal mood key for "Write more". */
export function journalMoodFromCheckin(mood: number | null | undefined): JournalMood | null {
  switch (mood) {
    case 1:
      return 'sad';
    case 2:
      return 'tired';
    case 3:
      return 'calm';
    case 4:
      return 'happy';
    case 5:
      return 'excited';
    default:
      return null;
  }
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatHeroDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatSectionTitle(dateKey: string): string {
  const today = localDateKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate);
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function growthPathFromTags(tags: string[]): string | null {
  const pathTag = tags.find((t) => t.startsWith('path:'));
  if (pathTag) return pathTag.slice(5);
  return null;
}

export function tagsWithGrowthPath(path: string | null, existing: string[] = []): string[] {
  const without = existing.filter((t) => !t.startsWith('path:'));
  if (!path) return without;
  return [`path:${path}`, ...without];
}
