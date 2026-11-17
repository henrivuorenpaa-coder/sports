/** Apufunktiot /api/coach-funktiolle (testattavissa ilman verkkoa). */

/** Sallitut käyttäjät ympäristömuuttujasta COACH_ALLOWED_EMAILS (pilkuilla eroteltu). Tyhjä = ei ketään. */
export function parseAllowed(env: string | undefined) {
  return (env || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowed(email: string | undefined, allowed: string[]) {
  return !!email && allowed.includes(email.toLowerCase());
}

/** Poimii JSON-objektin mallin vastauksesta (sietää ```json-aidat ja tekstiä ympärillä). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export const MAX_PROMPT_CHARS = 30_000;
