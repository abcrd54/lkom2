import type { MailAccountStatus, MailProvider } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

const ACTIVE_STATUSES = ["active", "reauth_required"] as const;

export type MailAccountRecord = {
  id: string;
  provider: MailProvider;
  email_address: string;
  status: MailAccountStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConnectedUsersCountRow = {
  mail_account_id: string;
};

type SyncableMailAccountRow = {
  id: string;
  provider: MailProvider;
  email_address: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  status: MailAccountStatus;
  last_checked_at: string | null;
};

export type SyncableMailAccount = {
  id: string;
  provider: MailProvider;
  emailAddress: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  status: MailAccountStatus;
  lastCheckedAt: string | null;
};

export async function listMailAccounts() {
  const supabase = createSupabaseAdminClient();
  const [{ data: accounts, error: accountsError }, { data: counts, error: countsError }] =
    await Promise.all([
      supabase
        .from("mail_accounts")
        .select("id, provider, email_address, status, last_checked_at, created_at, updated_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("users")
        .select("mail_account_id")
        .in("status", [...ACTIVE_STATUSES])
    ]);

  if (accountsError) {
    throw accountsError;
  }

  if (countsError) {
    throw countsError;
  }

  const countMap = new Map(
    Object.entries(
      ((counts ?? []) as unknown as ConnectedUsersCountRow[]).reduce<Record<string, number>>(
        (accumulator, row) => {
          accumulator[row.mail_account_id] = (accumulator[row.mail_account_id] ?? 0) + 1;
          return accumulator;
        },
        {}
      )
    )
  );

  return ((accounts ?? []) as MailAccountRecord[]).map((account) => ({
    id: account.id,
    provider: account.provider,
    emailAddress: account.email_address,
    status: account.status,
    lastSyncAt: account.last_checked_at,
    connectedUsers: countMap.get(account.id) ?? 0,
    createdAt: account.created_at,
    updatedAt: account.updated_at
  }));
}

export async function getMailAccountSummary() {
  const supabase = createSupabaseAdminClient();
  const [
    { count: inboxCount, error: inboxError },
    { count: activeUserCount, error: userError },
    { count: otpCount, error: otpError },
    { count: problematicCount, error: problemError }
  ] = await Promise.all([
    supabase.from("mail_accounts").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("otp_messages").select("*", { count: "exact", head: true }),
    supabase
      .from("mail_accounts")
      .select("*", { count: "exact", head: true })
      .neq("status", "active")
  ]);

  if (inboxError) {
    throw inboxError;
  }

  if (userError) {
    throw userError;
  }

  if (otpError) {
    throw otpError;
  }

  if (problemError) {
    throw problemError;
  }

  return {
    inboxCount: inboxCount ?? 0,
    activeUserCount: activeUserCount ?? 0,
    otpCount: otpCount ?? 0,
    problematicCount: problematicCount ?? 0
  };
}

export async function getMailAccountById(mailAccountId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mail_accounts")
    .select("id, provider, email_address, status")
    .eq("id", mailAccountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listSyncableMailAccounts() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mail_accounts")
    .select(
      "id, provider, email_address, refresh_token_encrypted, token_expires_at, status, last_checked_at"
    )
    .neq("status", "disabled")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as SyncableMailAccountRow[]).map((account) => ({
    id: account.id,
    provider: account.provider,
    emailAddress: account.email_address,
    refreshToken: decryptSecret(account.refresh_token_encrypted),
    tokenExpiresAt: account.token_expires_at,
    status: account.status,
    lastCheckedAt: account.last_checked_at
  })) satisfies SyncableMailAccount[];
}

export async function updateMailAccountTokenState(input: {
  mailAccountId: string;
  refreshToken?: string;
  tokenExpiresAt?: string | null;
  status?: MailAccountStatus;
  lastCheckedAt?: string;
}) {
  const supabase = createSupabaseAdminClient();
  const payload: {
    refresh_token_encrypted?: string;
    token_expires_at?: string | null;
    status?: MailAccountStatus;
    last_checked_at?: string;
  } = {};

  if (input.refreshToken) {
    payload.refresh_token_encrypted = encryptSecret(input.refreshToken);
  }

  if ("tokenExpiresAt" in input) {
    payload.token_expires_at = input.tokenExpiresAt ?? null;
  }

  if (input.status) {
    payload.status = input.status;
  }

  if (input.lastCheckedAt) {
    payload.last_checked_at = input.lastCheckedAt;
  }

  const { error } = await supabase.from("mail_accounts").update(payload).eq("id", input.mailAccountId);

  if (error) {
    throw error;
  }
}
