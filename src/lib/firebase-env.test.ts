import { describe, expect, it } from "vitest";
import { getFirebaseClientConfig, getFirebaseSetupState } from "./firebase-env.ts";

const full = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "domain",
  VITE_FIREBASE_PROJECT_ID: "project",
  VITE_FIREBASE_STORAGE_BUCKET: "bucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "sender",
  VITE_FIREBASE_APP_ID: "app",
};

describe("firebase-env", () => {
  it("raportoi puuttuvat muuttujat", () => {
    const s = getFirebaseSetupState({ VITE_FIREBASE_PROJECT_ID: "p" });
    expect(s.isReady).toBe(false);
    expect(s.missing).toContain("VITE_FIREBASE_API_KEY");
    expect(s.missing).not.toContain("VITE_FIREBASE_PROJECT_ID");
    expect(getFirebaseClientConfig({})).toBeNull();
  });

  it("palauttaa konfiguraation, kun kaikki on asetettu", () => {
    expect(getFirebaseSetupState(full)).toEqual({ isReady: true, missing: [], message: "" });
    expect(getFirebaseClientConfig(full)?.projectId).toBe("project");
  });
});
