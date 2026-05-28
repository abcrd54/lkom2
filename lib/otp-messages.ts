import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const adminOtpFilterSchema = z.object({
  provider: z.enum(["google", "microsoft"]).optional(),
  mailAccountId: z.string().uuid().optional(),
  sender: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  page: z.coerce.number().int().min(1).default(1)
});

const OPENAI_OTP_FILTER =
  "sender.ilike.%openai%,sender.ilike.%chatgpt%,subject.ilike.%openai%,subject.ilike.%chatgpt%,body_preview.ilike.%openai%,body_preview.ilike.%chatgpt%";

export type PaginatedOtpMessagesResult = {
  items: Array<{
    id: string;
    mailAccountId: string;
    providerMessageId: string;
    provider: "google" | "microsoft";
    inboxAddress: string;
    inboxStatus?: string;
    sender: string;
    recipient: string;
    subject: string;
    otpCode: string;
    bodyPreview?: string | null;
    receivedAt: string;
    createdAt?: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type OtpMessageRow = {
  id: string;
  mail_account_id: string;
  provider_message_id: string;
  sender: string;
  recipient: string;
  subject: string;
  otp_code: string;
  body_preview: string | null;
  received_at: string;
  created_at: string;
  mail_accounts?:
    | {
        provider: "google" | "microsoft";
        email_address: string;
        status: string;
      }
    | Array<{
        provider: "google" | "microsoft";
        email_address: string;
        status: string;
      }>
    | null;
};

function extractMailAccountRelation(relation: OtpMessageRow["mail_accounts"]) {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

export async function listAdminOtpMessages(rawFilters: unknown) {
  const filters = adminOtpFilterSchema.parse(rawFilters);
  const from = (filters.page - 1) * filters.limit;
  const to = from + filters.limit - 1;
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("otp_messages")
    .select(
      "id, mail_account_id, provider_message_id, sender, recipient, subject, otp_code, body_preview, received_at, created_at, mail_accounts(provider, email_address, status)"
    )
    .order("received_at", { ascending: false })
    .range(from, to);
  let countQuery = supabase
    .from("otp_messages")
    .select("id, mail_accounts(provider)", { count: "exact", head: true });

  if (filters.mailAccountId) {
    query = query.eq("mail_account_id", filters.mailAccountId);
    countQuery = countQuery.eq("mail_account_id", filters.mailAccountId);
  }

  if (filters.sender) {
    query = query.ilike("sender", `%${filters.sender}%`);
    countQuery = countQuery.ilike("sender", `%${filters.sender}%`);
  }

  if (filters.subject) {
    query = query.ilike("subject", `%${filters.subject}%`);
    countQuery = countQuery.ilike("subject", `%${filters.subject}%`);
  }

  if (filters.provider) {
    query = query.eq("mail_accounts.provider", filters.provider);
    countQuery = countQuery.eq("mail_accounts.provider", filters.provider);
  }

  const [{ data, error }, countResult] = await Promise.all([
    query,
    countQuery
  ]);

  if (error) {
    throw error;
  }

  if (countResult.error) {
    throw countResult.error;
  }

  const items = ((data ?? []) as unknown as OtpMessageRow[]).map((row) => {
    const relation = extractMailAccountRelation(row.mail_accounts);

    return {
      id: row.id,
      mailAccountId: row.mail_account_id,
      providerMessageId: row.provider_message_id,
      provider: relation?.provider ?? "google",
      inboxAddress: relation?.email_address ?? "",
      inboxStatus: relation?.status ?? "active",
      sender: row.sender,
      recipient: row.recipient,
      subject: row.subject,
      otpCode: row.otp_code,
      bodyPreview: row.body_preview,
      receivedAt: row.received_at,
      createdAt: row.created_at
    };
  });

  const total = countResult.count ?? 0;

  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.limit,
    totalPages: Math.max(1, Math.ceil(total / filters.limit))
  } satisfies PaginatedOtpMessagesResult;
}

export async function listOtpMessagesForMailAccount(
  mailAccountId: string,
  limit = 50,
  options?: {
    receivedAfter?: string;
    openAiOnly?: boolean;
  }
) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("otp_messages")
    .select(
      "id, mail_account_id, provider_message_id, sender, recipient, subject, otp_code, body_preview, received_at, created_at, mail_accounts(provider, email_address, status)"
    )
    .eq("mail_account_id", mailAccountId)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (options?.receivedAfter) {
    query = query.gte("received_at", options.receivedAfter);
  }

  if (options?.openAiOnly) {
    query = query.or(OPENAI_OTP_FILTER);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as OtpMessageRow[]).map((row) => {
    const relation = extractMailAccountRelation(row.mail_accounts);

    return {
      id: row.id,
      mailAccountId: row.mail_account_id,
      providerMessageId: row.provider_message_id,
      provider: relation?.provider ?? "google",
      inboxAddress: relation?.email_address ?? "",
      sender: row.sender,
      recipient: row.recipient,
      subject: row.subject,
      otpCode: row.otp_code,
      bodyPreview: row.body_preview,
      receivedAt: row.received_at
    };
  });
}
