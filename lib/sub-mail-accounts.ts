import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMailAccountById } from "@/lib/mail-accounts";
import type { MailProvider } from "@/lib/types";

export const createSubMailAccountSchema = z.object({
  mailAccountId: z.string().uuid(),
  label: z.string().trim().min(2).max(120),
  displayEmail: z.string().trim().email(),
  maxUsers: z.coerce.number().int().min(1).max(100).default(3)
});

type SubMailAccountRow = {
  id: string;
  mail_account_id: string;
  label: string;
  display_email: string;
  max_users: number;
  created_at: string;
  updated_at: string;
};

type SubMailAccountLookupRow = SubMailAccountRow & {
  mail_accounts?:
    | {
        provider: "google" | "microsoft";
        status: string;
      }
    | Array<{
        provider: "google" | "microsoft";
        status: string;
      }>
    | null;
};

type MailAccountLookupRow = {
  id: string;
  provider: MailProvider;
  email_address: string;
  status: string;
};

export type SubMailAccountView = {
  id: string;
  mailAccountId: string;
  label: string;
  displayEmail: string;
  maxUsers: number;
  connectedUsers: number;
  createdAt: string;
  updatedAt: string;
};

export async function getSubMailAccountById(subMailAccountId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sub_mail_accounts")
    .select("id, mail_account_id, label, display_email, max_users, created_at, updated_at")
    .eq("id", subMailAccountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as SubMailAccountRow;

  return {
    id: row.id,
    mailAccountId: row.mail_account_id,
    label: row.label,
    displayEmail: row.display_email,
    maxUsers: row.max_users,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createSubMailAccount(input: z.infer<typeof createSubMailAccountSchema>) {
  const mailAccount = await getMailAccountById(input.mailAccountId);

  if (!mailAccount) {
    throw new Error("Selected inbox was not found.");
  }

  if (mailAccount.provider !== "google") {
    throw new Error("Sub-Gmail is only available for Google inboxes.");
  }

  if (mailAccount.status === "disabled") {
    throw new Error("Selected inbox is disabled.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sub_mail_accounts")
    .insert({
      mail_account_id: input.mailAccountId,
      label: input.label,
      display_email: input.displayEmail.trim().toLowerCase(),
      max_users: input.maxUsers
    })
    .select("id, mail_account_id, label, display_email, max_users, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  const row = data as SubMailAccountRow;
  return {
    id: row.id,
    mailAccountId: row.mail_account_id,
    label: row.label,
    displayEmail: row.display_email,
    maxUsers: row.max_users,
    connectedUsers: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } satisfies SubMailAccountView;
}

export async function getActiveSubMailAccountByDisplayEmail(displayEmail: string) {
  const supabase = createSupabaseAdminClient();
  const normalizedDisplayEmail = displayEmail.trim().toLowerCase();
  const { data, error } = await supabase
    .from("sub_mail_accounts")
    .select(
      "id, mail_account_id, label, display_email, max_users, created_at, updated_at, mail_accounts(provider, status)"
    )
    .eq("display_email", normalizedDisplayEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as SubMailAccountLookupRow;
  const mailAccount = Array.isArray(row.mail_accounts)
    ? (row.mail_accounts[0] ?? null)
    : row.mail_accounts ?? null;

  if (!mailAccount || mailAccount.status === "disabled") {
    return null;
  }

  return {
    id: row.id,
    mailAccountId: row.mail_account_id,
    label: row.label,
    displayEmail: row.display_email,
    maxUsers: row.max_users,
    connectedUsers: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } satisfies SubMailAccountView;
}

export async function resolveActiveInboxSlotByEmail(displayEmail: string) {
  const normalizedDisplayEmail = displayEmail.trim().toLowerCase();
  const existingSubMailAccount = await getActiveSubMailAccountByDisplayEmail(normalizedDisplayEmail);

  if (existingSubMailAccount) {
    return existingSubMailAccount;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mail_accounts")
    .select("id, provider, email_address, status")
    .eq("email_address", normalizedDisplayEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const mailAccount = data as MailAccountLookupRow | null;

  if (!mailAccount || mailAccount.status === "disabled") {
    return null;
  }

  const { data: primarySubAccount, error: primarySubAccountError } = await supabase
    .from("sub_mail_accounts")
    .upsert(
      {
        mail_account_id: mailAccount.id,
        label: "Primary",
        display_email: normalizedDisplayEmail,
        max_users: 3
      },
      {
        onConflict: "mail_account_id,display_email"
      }
    )
    .select("id, mail_account_id, label, display_email, max_users, created_at, updated_at")
    .single();

  if (primarySubAccountError) {
    throw primarySubAccountError;
  }

  const row = primarySubAccount as SubMailAccountRow;

  return {
    id: row.id,
    mailAccountId: row.mail_account_id,
    label: row.label,
    displayEmail: row.display_email,
    maxUsers: row.max_users,
    connectedUsers: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } satisfies SubMailAccountView;
}
