import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { isAllowed, parseAllowed } from "./coach-lib.js";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Tarkistaa Firebase ID -tokenin (Authorization: Bearer …) ja että sähköposti on sallittujen listalla
 * (ALLOWED_EMAILS, tai vanha nimi COACH_ALLOWED_EMAILS). ID-tokenin tarkistus tarvitsee vain projektin tunnuksen.
 * Palauttaa käyttäjän tai valmiin virhevastauksen.
 */
export async function requireUser(request: Request): Promise<DecodedIdToken | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { code: "unauthenticated" });
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID });
  let user: DecodedIdToken;
  try { user = await getAuth(app).verifyIdToken(token); } catch { return json(401, { code: "unauthenticated" }); }
  const allowed = parseAllowed(process.env.ALLOWED_EMAILS || process.env.COACH_ALLOWED_EMAILS);
  if (!isAllowed(user.email, allowed)) return json(403, { code: "not_allowed" });
  return user;
}
