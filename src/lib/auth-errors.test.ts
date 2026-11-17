import { describe, expect, it } from "vitest";
import { authErrorText } from "./auth-errors.ts";

describe("authErrorText", () => {
  it("kääntää tunnetut koodit", () => {
    expect(authErrorText({ code: "auth/invalid-credential" })).toBe("Väärä sähköposti tai salasana.");
    expect(authErrorText({ code: "auth/weak-password" })).toMatch(/6 merkkiä/);
  });
  it("näyttää tuntemattoman koodin", () => {
    expect(authErrorText({ code: "auth/x" })).toBe("Kirjautuminen epäonnistui (auth/x).");
    expect(authErrorText(new Error("y"))).toBe("Kirjautuminen epäonnistui.");
  });
});
