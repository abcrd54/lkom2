import { z } from "zod";
import {
  buildAbsoluteAccessLink,
  buildAbsoluteRedeemLink,
  decryptAccessToken
} from "@/lib/access-links";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const createWhatsappTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  message: z.string().trim().min(1).max(60000)
});

export const sendWhatsappSchema = z.object({
  templateId: z.string().uuid(),
  recipientUserIds: z.array(z.string().uuid()).min(1).max(10)
});

type WhatsappTemplateRow = {
  id: string;
  name: string;
  message: string;
  created_at: string;
  updated_at: string;
};

type WhatsappLogRow = {
  id: string;
  template_id: string | null;
  template_name: string;
  message: string;
  recipients: Array<{
    userId: string;
    name: string;
    phoneNumber: string;
    email?: string;
    redeemCode?: string | null;
    redeemLink?: string;
  }>;
  recipient_count: number;
  status: "queued" | "sent" | "failed" | "partial";
  provider_request_id: string | null;
  provider_response: unknown;
  created_at: string;
};

type RecipientRow = {
  id: string;
  name: string;
  phone_number: string;
  status: "active" | "disabled";
  access_token_encrypted: string;
  mail_accounts?:
    | {
        email_address: string;
      }
    | Array<{
        email_address: string;
      }>
    | null;
  redeem_code_users?:
    | Array<{
        assigned_at: string;
        redeem_codes?:
          | {
              code: string;
            }
          | Array<{
              code: string;
            }>
          | null;
      }>
    | null;
};

function getInboxEmail(relation: RecipientRow["mail_accounts"]): string {
  const mailAccount = Array.isArray(relation) ? (relation[0] ?? null) : relation ?? null;
  return mailAccount?.email_address ?? "";
}

function getLatestRedeemCode(
  assignments: RecipientRow["redeem_code_users"]
): string | null {
  if (!assignments || assignments.length === 0) {
    return null;
  }

  const latestAssignment = [...assignments].sort((left, right) =>
    right.assigned_at.localeCompare(left.assigned_at)
  )[0];
  const relation = Array.isArray(latestAssignment?.redeem_codes)
    ? latestAssignment.redeem_codes[0] ?? null
    : latestAssignment?.redeem_codes ?? null;

  return relation?.code ?? null;
}

export async function listWhatsappTemplates() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("id, name, message, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as WhatsappTemplateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function createWhatsappTemplate(input: z.infer<typeof createWhatsappTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .insert({
      name: input.name,
      message: input.message
    })
    .select("id, name, message, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  const row = data as WhatsappTemplateRow;
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listWhatsappLogs(limit = 50) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_logs")
    .select(
      "id, template_id, template_name, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as WhatsappLogRow[]).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    message: row.message,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    recipientCount: row.recipient_count,
    status: row.status,
    providerRequestId: row.provider_request_id,
    providerResponse: row.provider_response,
    createdAt: row.created_at
  }));
}

export async function listWhatsappRecipients() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, phone_number, status, access_token_encrypted, mail_accounts(email_address), redeem_code_users(assigned_at, redeem_codes(code))"
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const origin = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return ((data ?? []) as RecipientRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    status: row.status,
    email: getInboxEmail(row.mail_accounts),
    accessLink: buildAbsoluteAccessLink(origin, decryptAccessToken(row.access_token_encrypted)),
    redeemCode: getLatestRedeemCode(row.redeem_code_users),
    redeemLink: buildAbsoluteRedeemLink(origin, decryptAccessToken(row.access_token_encrypted))
  }));
}

async function getTemplateById(templateId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("id, name, message")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getRecipientsByIds(recipientUserIds: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, phone_number, status, access_token_encrypted, mail_accounts(email_address), redeem_code_users(assigned_at, redeem_codes(code))"
    )
    .in("id", recipientUserIds)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  const origin = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return ((data ?? []) as RecipientRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    email: getInboxEmail(row.mail_accounts),
    accessLink: buildAbsoluteAccessLink(origin, decryptAccessToken(row.access_token_encrypted)),
    redeemCode: getLatestRedeemCode(row.redeem_code_users),
    redeemLink: buildAbsoluteRedeemLink(origin, decryptAccessToken(row.access_token_encrypted))
  }));
}

export async function sendWhatsappCampaign(input: z.infer<typeof sendWhatsappSchema>) {
  if (!env.FONNTE_TOKEN) {
    throw new Error("FONNTE_TOKEN is not configured.");
  }

  const template = await getTemplateById(input.templateId);
  if (!template) {
    throw new Error("Selected WhatsApp template was not found.");
  }

  const recipients = await getRecipientsByIds(input.recipientUserIds);

  if (recipients.length !== input.recipientUserIds.length) {
    throw new Error("One or more selected recipients are invalid or inactive.");
  }

  const target = recipients
    .map(
      (recipient) =>
        `${recipient.phoneNumber}|${recipient.name}|${recipient.phoneNumber}|${recipient.accessLink}|${recipient.redeemCode ?? "-"}|${recipient.email || "-"}|${recipient.redeemLink}`
    )
    .join(",");
  const formData = new FormData();
  formData.set("target", target);
  formData.set(
    "message",
    template.message
      .replaceAll("{phone}", "{var1}")
      .replaceAll("{link}", "{var2}")
      .replaceAll("{code}", "{var3}")
      .replaceAll("{email}", "{var4}")
      .replaceAll("{redeem_link}", "{var5}")
  );
  formData.set("countryCode", "0");

  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: env.FONNTE_TOKEN
    },
    body: formData
  });

  const payload = await response.json();
  const isSuccess = response.ok && payload?.status === true;
  const status: "queued" | "failed" | "partial" | "sent" = isSuccess
    ? payload?.process === "pending"
      ? "queued"
      : "sent"
    : "failed";

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("whatsapp_logs")
    .insert({
      template_id: template.id,
      template_name: template.name,
      message: template.message,
      recipients,
      recipient_count: recipients.length,
      status,
      provider_request_id:
        typeof payload?.requestid === "number" || typeof payload?.requestid === "string"
          ? String(payload.requestid)
          : null,
      provider_response: payload
    })
    .select(
      "id, template_id, template_name, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .single();

  if (logError) {
    throw logError;
  }

  if (!isSuccess) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.reason === "string"
          ? payload.reason
          : "Fonnte send failed.";
    throw new Error(detail);
  }

  return {
    log: logRow as WhatsappLogRow,
    detail: typeof payload?.detail === "string" ? payload.detail : "WhatsApp message queued."
  };
}
