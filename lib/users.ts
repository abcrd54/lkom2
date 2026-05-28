import { decryptAccessToken, encryptAccessToken, generateAccessToken, hashAccessToken } from "@/lib/access-links";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSubMailAccountById } from "@/lib/sub-mail-accounts";
import type { MailProvider, UserStatus } from "@/lib/types";
import { z } from "zod";

const baseUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phoneNumber: z.string().trim().min(8).max(30),
  subMailAccountId: z.string().uuid().nullable().optional()
});

export const createUserSchema = baseUserSchema;

export const updateUserSchema = baseUserSchema.extend({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]).optional()
});

export const disableUserSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean()
});

export const deleteUserSchema = z.object({
  userId: z.string().uuid()
});

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone_number: string;
  mail_account_id: string | null;
  sub_mail_account_id: string | null;
  access_token_encrypted: string;
  status: UserStatus;
  link_disabled_at: string | null;
  created_at: string;
  updated_at: string;
  mail_accounts?:
    | {
        provider: MailProvider;
        email_address: string;
        status: string;
      }
    | Array<{
        provider: MailProvider;
        email_address: string;
        status: string;
      }>
    | null;
  sub_mail_accounts?:
    | {
        label: string;
        display_email: string;
        max_users: number;
      }
    | Array<{
        label: string;
        display_email: string;
        max_users: number;
      }>
    | null;
};

function extractMailAccountRelation(relation: UserRow["mail_accounts"]) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function extractSubMailAccountRelation(relation: UserRow["sub_mail_accounts"]) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

export type UserView = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  status: UserStatus;
  mailAccountId: string | null;
  subMailAccountId: string | null;
  subMailAccountLabel: string;
  provider: MailProvider | null;
  inboxAddress: string;
  sourceInboxAddress: string;
  inboxStatus: string | null;
  linkDisabledAt: string | null;
  accessToken: string;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedUsersResult = {
  items: UserView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function mapUserRow(row: UserRow): UserView {
  const accessToken = decryptAccessToken(row.access_token_encrypted);
  const mailAccount = extractMailAccountRelation(row.mail_accounts);
  const subMailAccount = extractSubMailAccountRelation(row.sub_mail_accounts);

  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phoneNumber: row.phone_number,
    status: row.status,
    mailAccountId: row.mail_account_id,
    subMailAccountId: row.sub_mail_account_id,
    subMailAccountLabel: subMailAccount?.label ?? (mailAccount ? "Primary" : "Redeem"),
    provider: mailAccount?.provider ?? null,
    inboxAddress: subMailAccount?.display_email ?? mailAccount?.email_address ?? "",
    sourceInboxAddress: mailAccount?.email_address ?? "",
    inboxStatus: mailAccount?.status ?? null,
    linkDisabledAt: row.link_disabled_at,
    accessToken,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePhoneNumber(phoneNumber: string) {
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.startsWith("0")) {
    return `62${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith("62")) {
    return digitsOnly;
  }

  return digitsOnly;
}

export function normalizeUserPhoneNumber(phoneNumber: string) {
  return normalizePhoneNumber(phoneNumber);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUserEmail(email: string) {
  return normalizeEmail(email);
}

async function assertUniquePhoneNumber(phoneNumber: string, userId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("users")
    .select("id, name", { count: "exact" })
    .eq("phone_number", phoneNumber);

  if (userId) {
    query = query.neq("id", userId);
  }

  const { data, error, count } = await query.limit(1);

  if (error) {
    throw error;
  }

  if ((count ?? 0) > 0) {
    const existingUser = Array.isArray(data) ? data[0] : null;
    const existingName =
      existingUser && typeof existingUser.name === "string" ? existingUser.name : "another user";
    throw new Error(`Phone number is already used by ${existingName}.`);
  }
}

async function assertUniqueEmail(email: string, userId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("users").select("id, name", { count: "exact" }).eq("email", email);

  if (userId) {
    query = query.neq("id", userId);
  }

  const { data, error, count } = await query.limit(1);

  if (error) {
    throw error;
  }

  if ((count ?? 0) > 0) {
    const existingUser = Array.isArray(data) ? data[0] : null;
    const existingName =
      existingUser && typeof existingUser.name === "string" ? existingUser.name : "another user";
    throw new Error(`Email is already used by ${existingName}.`);
  }
}

async function assertAssignableSubMailAccount(subMailAccountId: string) {
  const subMailAccount = await getSubMailAccountById(subMailAccountId);

  if (!subMailAccount) {
    throw new Error("Selected sub account was not found.");
  }

  return subMailAccount;
}

async function resolveUserAssignment(subMailAccountId?: string | null) {
  if (!subMailAccountId) {
    return {
      mailAccountId: null,
      subMailAccountId: null
    };
  }

  const subMailAccount = await assertAssignableSubMailAccount(subMailAccountId);

  return {
    mailAccountId: subMailAccount.mailAccountId,
    subMailAccountId: subMailAccount.id
  };
}

export async function listUsers() {
  const result = await listUsersPage({ page: 1, pageSize: 1000 });
  return result.items;
}

export async function listUsersPage(input?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, input?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = createSupabaseAdminClient();
  const [{ data, error }, countResult] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
      )
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.from("users").select("*", { count: "exact", head: true })
  ]);

  if (error) {
    throw error;
  }

  if (countResult.error) {
    throw countResult.error;
  }

  const total = countResult.count ?? 0;

  return {
    items: ((data ?? []) as unknown as UserRow[]).map(mapUserRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  } satisfies PaginatedUsersResult;
}

export async function createUser(input: z.infer<typeof createUserSchema>) {
  const assignment = await resolveUserAssignment(input.subMailAccountId);
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhoneNumber = normalizePhoneNumber(input.phoneNumber);
  await assertUniqueEmail(normalizedEmail);
  await assertUniquePhoneNumber(normalizedPhoneNumber);

  const supabase = createSupabaseAdminClient();
  const accessToken = generateAccessToken();
  const accessTokenEncrypted = encryptAccessToken(accessToken);
  const accessTokenHash = hashAccessToken(accessToken);

  const { data, error } = await supabase
    .from("users")
    .insert({
      name: input.name,
      email: normalizedEmail,
      phone_number: normalizedPhoneNumber,
      mail_account_id: assignment.mailAccountId,
      sub_mail_account_id: assignment.subMailAccountId,
      access_token_encrypted: accessTokenEncrypted,
      access_token_hash: accessTokenHash,
      status: "active",
      link_disabled_at: null
    })
    .select(
      "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
    )
    .single();

  if (error) {
    throw error;
  }

  return mapUserRow(data as unknown as UserRow);
}

export async function updateUser(input: z.infer<typeof updateUserSchema>) {
  const assignment = await resolveUserAssignment(input.subMailAccountId);
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhoneNumber = normalizePhoneNumber(input.phoneNumber);
  await assertUniqueEmail(normalizedEmail, input.userId);
  await assertUniquePhoneNumber(normalizedPhoneNumber, input.userId);

  const supabase = createSupabaseAdminClient();
  const payload: {
    name: string;
    email: string;
    phone_number: string;
    mail_account_id: string | null;
    sub_mail_account_id: string | null;
    status?: UserStatus;
    link_disabled_at?: string | null;
  } = {
    name: input.name,
    email: normalizedEmail,
    phone_number: normalizedPhoneNumber,
    mail_account_id: assignment.mailAccountId,
    sub_mail_account_id: assignment.subMailAccountId
  };

  if (input.status) {
    payload.status = input.status;
    payload.link_disabled_at = input.status === "disabled" ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("users")
    .update(payload)
    .eq("id", input.userId)
    .select(
      "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
    )
    .single();

  if (error) {
    throw error;
  }

  return mapUserRow(data as unknown as UserRow);
}

export async function setUserDisabled(input: z.infer<typeof disableUserSchema>) {
  const supabase = createSupabaseAdminClient();
  const nextStatus: UserStatus = input.disabled ? "disabled" : "active";

  const { data, error } = await supabase
    .from("users")
    .update({
      status: nextStatus,
      link_disabled_at: input.disabled ? new Date().toISOString() : null
    })
    .eq("id", input.userId)
    .select(
      "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
    )
    .single();

  if (error) {
    throw error;
  }

  return mapUserRow(data as unknown as UserRow);
}

export async function deleteUser(input: z.infer<typeof deleteUserSchema>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("users").delete().eq("id", input.userId);

  if (error) {
    throw error;
  }

  return { deleted: true };
}

export async function getUserByAccessToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
    )
    .eq("access_token_hash", hashAccessToken(token))
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapUserRow(data as unknown as UserRow);
}

export async function findUserByPhoneNumber(phoneNumber: string) {
  const supabase = createSupabaseAdminClient();
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, email, phone_number, mail_account_id, sub_mail_account_id, access_token_encrypted, status, link_disabled_at, created_at, updated_at, mail_accounts(provider, email_address, status), sub_mail_accounts(label, display_email, max_users)"
    )
    .eq("phone_number", normalizedPhoneNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapUserRow(data as unknown as UserRow);
}
