import Anthropic from "@anthropic-ai/sdk";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { extractJson, isAllowed, MAX_PROMPT_CHARS, parseAllowed } from "./_lib/coach-lib.js";

/**
 * POST /api/coach  { prompt }  →  { analysis, proposals }
 *
 * Vaatii Firebase ID -tokenin (Authorization: Bearer …) ja että käyttäjän sähköposti on listalla
 * COACH_ALLOWED_EMAILS. ID-tokenin tarkistus tarvitsee vain projektin tunnuksen, ei palvelutiliä.
 * Ympäristömuuttujat: ANTHROPIC_API_KEY, COACH_ALLOWED_EMAILS, VITE_FIREBASE_PROJECT_ID.
 */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function adminAuth() {
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID });
  return getAuth(app);
}

export async function POST(request: Request) {
  // 1. Kuka kysyy?
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { code: "unauthenticated" });
  let user;
  try { user = await adminAuth().verifyIdToken(token); } catch { return json(401, { code: "unauthenticated" }); }
  if (!isAllowed(user.email, parseAllowed(process.env.COACH_ALLOWED_EMAILS)))
    return json(403, { code: "not_allowed" });

  // 2. Syöte
  let prompt: unknown;
  try { ({ prompt } = await request.json()); } catch { return json(400, { code: "bad_request" }); }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) return json(400, { code: "bad_request" });

  // 3. Claude
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { code: "bad_api_key" });
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // Jos turvallisuusluokitin hylkää pyynnön, API ajaa sen automaattisesti varamallilla.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return json(502, { code: "refusal" });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const result = extractJson(text);
    if (!result || typeof result !== "object") return json(502, { code: "invalid_json" });
    return json(200, result);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { code: "rate_limited" });
    if (e instanceof Anthropic.AuthenticationError) return json(500, { code: "bad_api_key" });
    if (e instanceof Anthropic.APIError) return json(502, { code: "api_error", status: e.status });
    return json(500, { code: "error" });
  }
}
