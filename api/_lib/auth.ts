import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAllowed, parseAllowed } from "./coach-lib.js";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Firebase ID -tokenin julkiset avaimet (Firebase-dokumentaation "Verify ID tokens using a third-party JWT library").
// firebase-admin ei toimi Vercelin Node-ajossa (jwks-rsa → require(jose) → ERR_REQUIRE_ESM), joten tarkistus tehdään josella.
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export interface FirebaseUser { uid: string; email?: string }

/** Tarkistaa Firebase ID -tokenin allekirjoituksen, myöntäjän, yleisön ja voimassaolon. */
export async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseUser> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (!payload.sub) throw new Error("no sub");
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}

/**
 * Tarkistaa Firebase ID -tokenin (Authorization: Bearer …) ja että sähköposti on sallittujen listalla
 * (ALLOWED_EMAILS, tai vanha nimi COACH_ALLOWED_EMAILS). Tarvitsee vain projektin tunnuksen.
 * Palauttaa käyttäjän tai valmiin virhevastauksen.
 */
export async function requireUser(request: Request): Promise<FirebaseUser | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { code: "unauthenticated" });
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return json(500, { code: "server_misconfigured" });
  let user: FirebaseUser;
  try { user = await verifyFirebaseToken(token, projectId); } catch { return json(401, { code: "unauthenticated" }); }
  const allowed = parseAllowed(process.env.ALLOWED_EMAILS || process.env.COACH_ALLOWED_EMAILS);
  if (!isAllowed(user.email, allowed)) return json(403, { code: "not_allowed" });
  return user;
}
