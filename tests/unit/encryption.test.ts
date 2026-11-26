import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TokenCrypto } from "@/lib/encryption/tokens";

const key = () => randomBytes(32).toString("base64");

describe("TokenCrypto (AES-256-GCM)", () => {
  it("round-trips and never contains the plaintext", () => {
    const c = new TokenCrypto(key());
    const env = c.encrypt("super-secret-refresh-token", "conn-1");
    expect(env).not.toContain("super-secret");
    expect(c.decrypt(env, "conn-1")).toBe("super-secret-refresh-token");
  });

  it("uses a fresh IV for every encryption", () => {
    const c = new TokenCrypto(key());
    expect(c.encrypt("x")).not.toBe(c.encrypt("x"));
  });

  it("binds ciphertext to the connection id (associated data)", () => {
    const c = new TokenCrypto(key());
    const env = c.encrypt("token", "conn-1");
    expect(() => c.decrypt(env, "conn-2")).toThrow();
  });

  it("detects tampering", () => {
    const c = new TokenCrypto(key());
    const parts = c.encrypt("token").split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => c.decrypt(parts.join("."))).toThrow();
  });

  it("supports key rotation via previous key", () => {
    const oldKey = key();
    const oldC = new TokenCrypto(oldKey);
    const env = oldC.encrypt("token");
    const rotated = new TokenCrypto(key(), oldKey);
    expect(rotated.decrypt(env)).toBe("token");
    expect(rotated.needsRotation(env)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt("token"))).toBe(false);
  });

  it("rejects keys with the wrong length", () => {
    expect(() => new TokenCrypto(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
