const ADJECTIVES = [
  'bright',
  'calm',
  'clear',
  'clever',
  'cool',
  'eager',
  'fair',
  'fresh',
  'gentle',
  'grand',
  'kind',
  'lively',
  'mellow',
  'nimble',
  'proud',
  'quick',
  'quiet',
  'sharp',
  'solid',
  'swift',
  'vivid',
  'warm',
];

const NOUNS = [
  'atlas',
  'brook',
  'canyon',
  'delta',
  'echo',
  'field',
  'forest',
  'harbor',
  'island',
  'meadow',
  'mesa',
  'orchard',
  'ridge',
  'river',
  'stone',
  'summit',
  'trail',
  'valley',
  'wind',
  'zephyr',
];

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export function normalizeCourseCode(code: string) {
  return code.trim().toLowerCase();
}

export async function generateUniqueCourseCode(
  exists: (code: string) => Promise<boolean>,
  maxAttempts = 8,
) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
    if (!(await exists(candidate))) return candidate;
  }
  const fallback = `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(100 + Math.random() * 900)}`;
  return fallback;
}
