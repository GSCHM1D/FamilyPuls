import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for OAuth tokens.
 * Format: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 * keyId = first 8 hex chars of SHA-256(key) – allows key rotation via
 * TOKEN_ENCRYPTION_KEY_PREVIOUS without storing which key was used.
 */
const VERSION = "v1";

export class TokenCrypto {
  private readonly keys: { id: string; key: Buffer }[];

  constructor(primaryKeyB64: string, previousKeyB64?: string) {
    const primary = TokenCrypto.parseKey(primaryKeyB64);
    this.keys = [primary];
    if (previousKeyB64) this.keys.push(TokenCrypto.parseKey(previousKeyB64));
  }

  static parseKey(b64: string): { id: string; key: Buffer } {
    const key = Buffer.from(b64, "base64");
    if (key.length !== 32) throw new Error("Encryption key must be exactly 32 bytes (base64 encoded)");
    const id = createHash("sha256").update(key).digest("hex").slice(0, 8);
    return { id, key };
  }

  encrypt(plaintext: string, associatedData?: string): string {
    const { id, key } = this.keys[0]!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, id, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(envelope: string, associatedData?: string): string {
    const parts = envelope.split(".");
    if (parts.length !== 5 || parts[0] !== VERSION) throw new Error("Unsupported token envelope");
    const [, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
    const entry = this.keys.find((k) => k.id === keyId);
    if (!entry) throw new Error("No matching encryption key for token envelope");
    const decipher = createDecipheriv("aes-256-gcm", entry.key, Buffer.from(ivB64, "base64url"));
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  }

  /** True if the envelope was encrypted with an older key and should be re-encrypted. */
  needsRotation(envelope: string): boolean {
    return envelope.split(".")[1] !== this.keys[0]!.id;
  }
}

let instance: TokenCrypto | null = null;

export function tokenCrypto(): TokenCrypto {
  if (!instance) {
    const primary = process.env.TOKEN_ENCRYPTION_KEY;
    if (!primary) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
    instance = new TokenCrypto(primary, process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS || undefined);
  }
  return instance;
}
