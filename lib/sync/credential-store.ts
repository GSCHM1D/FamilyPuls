import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenCrypto } from "@/lib/encryption/tokens";
import type { CredentialStore, StoredCredentials } from "@/lib/providers/token-manager";

/**
 * Credentials are AES-256-GCM encrypted; the connection id is used as
 * associated data so a ciphertext cannot be moved to another connection.
 */
export class SupabaseCredentialStore implements CredentialStore {
  constructor(private readonly db: SupabaseClient) {}

  async load(connectionId: string): Promise<StoredCredentials | null> {
    const { data, error } = await this.db
      .from("provider_credentials")
      .select("access_token_enc, refresh_token_enc, expires_at, scope")
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (error) throw new Error(`Credential load failed: ${error.code}`);
    if (!data) return null;
    const c = tokenCrypto();
    return {
      accessToken: c.decrypt(data.access_token_enc, connectionId),
      refreshToken: data.refresh_token_enc ? c.decrypt(data.refresh_token_enc, connectionId) : null,
      expiresAt: data.expires_at,
      scope: data.scope,
    };
  }

  async save(connectionId: string, creds: StoredCredentials): Promise<void> {
    const c = tokenCrypto();
    const { error } = await this.db.from("provider_credentials").upsert(
      {
        connection_id: connectionId,
        access_token_enc: c.encrypt(creds.accessToken, connectionId),
        refresh_token_enc: creds.refreshToken ? c.encrypt(creds.refreshToken, connectionId) : null,
        expires_at: creds.expiresAt,
        scope: creds.scope,
      },
      { onConflict: "connection_id" },
    );
    if (error) throw new Error(`Credential save failed: ${error.code}`);
  }

  async acquireRefreshLock(connectionId: string, leaseSeconds: number): Promise<boolean> {
    const { data, error } = await this.db.rpc("acquire_refresh_lock", { p_connection: connectionId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(`Lock failed: ${error.code}`);
    return data === true;
  }

  async releaseRefreshLock(connectionId: string): Promise<void> {
    await this.db.rpc("release_refresh_lock", { p_connection: connectionId });
  }

  async markReauthRequired(connectionId: string, reason: string): Promise<void> {
    await this.db.from("provider_connections").update({ status: "reauth_required", last_error: reason.slice(0, 300) }).eq("id", connectionId);
  }

  async delete(connectionId: string): Promise<void> {
    await this.db.from("provider_credentials").delete().eq("connection_id", connectionId);
  }
}
