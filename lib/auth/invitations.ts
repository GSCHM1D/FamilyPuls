import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const INVITATION_TTL_DAYS = 7;

export function generateInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

/** Only the hash is stored; a database leak does not reveal usable invitation links. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const passwordSchema = z.string().min(12).max(128);
export const emailSchema = z.email().max(254).transform((e) => e.toLowerCase().trim());
export const displayNameSchema = z.string().trim().min(1).max(60).regex(/^[^<>]*$/);

export interface InvitationRecord {
  id: string;
  family_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export function isInvitationUsable(inv: InvitationRecord | null, now = new Date()): inv is InvitationRecord {
  return !!inv && !inv.accepted_at && !inv.revoked_at && Date.parse(inv.expires_at) > now.getTime();
}
