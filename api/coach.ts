import Anthropic from "@anthropic-ai/sdk";
import { json, requireUser } from "./_lib/auth.js";
import { extractJson, MAX_PROMPT_CHARS } from "./_lib/coach-lib.js";

/**
 * POST /api/coach  { prompt }  →  { analysis, proposals }
 * Kirjautuminen ja sallitut sähköpostit: ks. _lib/auth.ts. Env: ANTHROPIC_API_KEY.
 */
export async function POST(request: Request) {
  // 1. Kuka kysyy?
  const user = await requireUser(request);
  if (user instanceof Response) return user;

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
