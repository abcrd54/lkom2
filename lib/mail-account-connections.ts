import type { MailProvider } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/secrets";

export async function upsertConnectedMailAccount(input: {
  provider: MailProvider;
  emailAddress: string;
  refreshToken: string;
  expiresInSeconds?: number;
}) {
  const supabase = createSupabaseAdminClient();
  const tokenExpiresAt =
    typeof input.expiresInSeconds === "number"
      ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
      : null;

  const { data, error } = await supabase
    .from("mail_accounts")
    .upsert(
      {
        provider: input.provider,
        email_address: input.emailAddress,
        refresh_token_encrypted: encryptSecret(input.refreshToken),
        token_expires_at: tokenExpiresAt,
        status: "active"
      },
      {
        onConflict: "email_address"
      }
    )
    .select("id, provider, email_address")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
