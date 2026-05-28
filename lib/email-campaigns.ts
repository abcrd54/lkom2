import { z } from "zod";
import {
  buildAbsoluteAccessLink,
  buildAbsoluteRedeemLink,
  decryptAccessToken
} from "@/lib/access-links";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(60000)
});

export const updateEmailTemplateSchema = createEmailTemplateSchema.extend({
  templateId: z.string().uuid()
});

export const deleteEmailTemplateSchema = z.object({
  templateId: z.string().uuid()
});

export const sendEmailCampaignSchema = z.object({
  templateId: z.string().uuid(),
  recipientUserIds: z.array(z.string().uuid()).min(1).max(10)
});

export const resendEmailLogSchema = z.object({
  logId: z.string().uuid()
});

type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  message: string;
  created_at: string;
  updated_at: string;
};

type EmailLogRow = {
  id: string;
  template_id: string | null;
  template_name: string;
  subject: string;
  message: string;
  recipients: Array<{
    userId: string;
    name: string;
    email: string;
    phoneNumber?: string;
    accessLink?: string;
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
  email: string | null;
  phone_number: string;
  status: "active" | "disabled";
  access_token_encrypted: string;
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

type LoggedRecipient = {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  accessLink: string;
  redeemCode: string | null;
  redeemLink: string;
};

function getEmailTemplateRecipientMode(templateName: string | null | undefined) {
  const normalizedName = templateName?.trim().toLowerCase();

  if (normalizedName === "kode") {
    return "redeem";
  }

  return "email";
}

function getEmailPrimaryLink(
  templateName: string | null | undefined,
  recipient: {
    accessLink: string;
    redeemLink: string;
  }
) {
  return getEmailTemplateRecipientMode(templateName) === "redeem"
    ? recipient.redeemLink
    : recipient.accessLink;
}

function getLatestRedeemCode(assignments: RecipientRow["redeem_code_users"]): string | null {
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

function renderTemplateValue(
  templateName: string,
  value: string,
  recipient: {
    name: string;
    phoneNumber: string;
    email: string;
    accessLink: string;
    redeemCode: string | null;
    redeemLink: string;
  }
) {
  const primaryLink = getEmailPrimaryLink(templateName, recipient);

  return value
    .replaceAll("{name}", recipient.name)
    .replaceAll("{phone}", recipient.phoneNumber)
    .replaceAll("{email}", recipient.email || "-")
    .replaceAll("{link}", primaryLink)
    .replaceAll("{code}", recipient.redeemCode ?? "-")
    .replaceAll("{redeem_link}", recipient.redeemLink);
}

function renderEmailHtml(message: string) {
  const escaped = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1f2d3d;white-space:pre-wrap;">${escaped}</div>`;
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  message: string;
  recipient: {
    userId?: string;
    id?: string;
  };
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: renderEmailHtml(input.message),
      text: input.message,
      tags: [
        { name: "channel", value: "dashboard" },
        {
          name: "user_id",
          value: (input.recipient.userId ?? input.recipient.id ?? "unknown").replaceAll("-", "_")
        }
      ]
    }),
    cache: "no-store"
  });

  const payload = await response.json();

  return {
    ok: response.ok && typeof payload?.id === "string",
    id: typeof payload?.id === "string" ? payload.id : null,
    payload
  };
}

export async function listEmailTemplates() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, name, subject, message, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as EmailTemplateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function createEmailTemplate(input: z.infer<typeof createEmailTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      name: input.name,
      subject: input.subject,
      message: input.message
    })
    .select("id, name, subject, message, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  const row = data as EmailTemplateRow;
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function updateEmailTemplate(input: z.infer<typeof updateEmailTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .update({
      name: input.name,
      subject: input.subject,
      message: input.message
    })
    .eq("id", input.templateId)
    .select("id, name, subject, message, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  const row = data as EmailTemplateRow;
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function deleteEmailTemplate(input: z.infer<typeof deleteEmailTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", input.templateId);

  if (error) {
    throw error;
  }

  return { deleted: true };
}

export async function listEmailLogs(limit = 50) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_logs")
    .select(
      "id, template_id, template_name, subject, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as EmailLogRow[]).map((row) => ({
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    subject: row.subject,
    message: row.message,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    recipientCount: row.recipient_count,
    status: row.status,
    providerRequestId: row.provider_request_id,
    providerResponse: row.provider_response,
    createdAt: row.created_at
  }));
}

async function getEmailLogById(logId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_logs")
    .select(
      "id, template_id, template_name, subject, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .eq("id", logId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as EmailLogRow | null) ?? null;
}

async function listSentEmailRecipientUserIds() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_logs")
    .select("recipients")
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return new Set(
    ((data ?? []) as Array<{ recipients: EmailLogRow["recipients"] }>).flatMap((row) =>
      Array.isArray(row.recipients)
        ? row.recipients
            .map((recipient) => {
              const value = recipient as Record<string, unknown>;
              return typeof value.userId === "string"
                ? value.userId
                : typeof value.id === "string"
                  ? value.id
                  : null;
            })
            .filter((userId): userId is string => typeof userId === "string" && userId.length > 0)
        : []
    )
  );
}

async function getEmailTemplateById(templateId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, name, subject, message")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function queryRecipients(options?: {
  recipientUserIds?: string[];
  limit?: number;
  excludeSent?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("users")
    .select(
      "id, name, email, phone_number, status, access_token_encrypted, redeem_code_users(assigned_at, redeem_codes(code))"
    )
    .eq("status", "active");

  if (options?.recipientUserIds?.length) {
    query = query.in("id", options.recipientUserIds);
  }

  if (typeof options?.limit === "number") {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const origin = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const sentRecipientUserIds = options?.excludeSent ? await listSentEmailRecipientUserIds() : null;

  return ((data ?? []) as RecipientRow[])
    .filter((row) => !sentRecipientUserIds?.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number,
      email: (row.email ?? "").trim().toLowerCase(),
      accessLink: buildAbsoluteAccessLink(origin, decryptAccessToken(row.access_token_encrypted)),
      redeemCode: getLatestRedeemCode(row.redeem_code_users),
      redeemLink: buildAbsoluteRedeemLink(origin, decryptAccessToken(row.access_token_encrypted))
    }))
    .filter((recipient) => recipient.email.length > 0);
}

export async function listEmailRecipients() {
  return queryRecipients({ limit: 100, excludeSent: true });
}

async function getRecipientsByIds(recipientUserIds: string[], options?: { excludeSent?: boolean }) {
  return queryRecipients({
    recipientUserIds,
    excludeSent: options?.excludeSent ?? true
  });
}

async function resolveRecipientsForResend(sourceRecipients: EmailLogRow["recipients"]) {
  const rawRecipients = (Array.isArray(sourceRecipients) ? sourceRecipients : [])
    .map((recipient) => {
      const value = recipient as Record<string, unknown>;
      return {
        userId:
          typeof value.userId === "string"
            ? value.userId
            : typeof value.id === "string"
              ? value.id
              : undefined,
        name: typeof value.name === "string" ? value.name : "",
        email: typeof value.email === "string" ? value.email.trim().toLowerCase() : "",
        phoneNumber: typeof value.phoneNumber === "string" ? value.phoneNumber : "",
        accessLink: typeof value.accessLink === "string" ? value.accessLink : undefined,
        redeemCode:
          typeof value.redeemCode === "string" || value.redeemCode === null
            ? (value.redeemCode as string | null)
            : undefined,
        redeemLink: typeof value.redeemLink === "string" ? value.redeemLink : undefined
      };
    })
    .filter((recipient) => recipient.name && recipient.email);

  if (rawRecipients.length === 0) {
    return [];
  }

  const currentRecipients = await queryRecipients({
    recipientUserIds: rawRecipients
      .map((recipient) => recipient.userId)
      .filter((userId): userId is string => typeof userId === "string" && userId.length > 0),
    excludeSent: false
  });
  const currentRecipientMap = new Map(
    currentRecipients.map((recipient) => [recipient.id, recipient] as const)
  );

  return rawRecipients
    .map((recipient) => {
      const currentRecipient = recipient.userId ? currentRecipientMap.get(recipient.userId) : null;

      return {
        userId: currentRecipient?.id ?? recipient.userId ?? recipient.email,
        name: currentRecipient?.name ?? recipient.name,
        email: currentRecipient?.email ?? recipient.email,
        phoneNumber: currentRecipient?.phoneNumber ?? recipient.phoneNumber,
        accessLink: recipient.accessLink ?? currentRecipient?.accessLink ?? "",
        redeemCode:
          recipient.redeemCode !== undefined
            ? recipient.redeemCode
            : (currentRecipient?.redeemCode ?? null),
        redeemLink: recipient.redeemLink ?? currentRecipient?.redeemLink ?? ""
      } satisfies LoggedRecipient;
    })
    .filter((recipient) => recipient.accessLink && recipient.redeemLink && recipient.email);
}

export async function sendEmailCampaign(input: z.infer<typeof sendEmailCampaignSchema>) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const template = await getEmailTemplateById(input.templateId);
  if (!template) {
    throw new Error("Selected email template was not found.");
  }

  const recipients = await getRecipientsByIds(input.recipientUserIds, { excludeSent: true });

  if (recipients.length !== input.recipientUserIds.length) {
    throw new Error("One or more selected recipients are invalid, inactive, missing email, or already sent.");
  }

  const deliveries = await Promise.all(
    recipients.map(async (recipient) => {
      const renderedSubject = renderTemplateValue(template.name, template.subject, recipient);
      const renderedMessage = renderTemplateValue(template.name, template.message, recipient);
      const result = await sendResendEmail({
        to: recipient.email,
        subject: renderedSubject,
        message: renderedMessage,
        recipient
      });

      return {
        userId: recipient.id,
        email: recipient.email,
        subject: renderedSubject,
        ok: result.ok,
        id: result.id,
        payload: result.payload
      };
    })
  );

  const successCount = deliveries.filter((delivery) => delivery.ok).length;
  const status: "queued" | "failed" | "partial" | "sent" =
    successCount === deliveries.length
      ? "sent"
      : successCount === 0
        ? "failed"
        : "partial";

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("email_logs")
    .insert({
      template_id: template.id,
      template_name: template.name,
      subject: template.subject,
      message: template.message,
      recipients: recipients.map((recipient) => ({
        userId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        phoneNumber: recipient.phoneNumber,
        accessLink: recipient.accessLink,
        redeemCode: recipient.redeemCode,
        redeemLink: recipient.redeemLink
      })),
      recipient_count: recipients.length,
      status,
      provider_request_id:
        deliveries.length === 1 ? (deliveries[0]?.id ?? null) : `${successCount}/${deliveries.length}`,
      provider_response: deliveries
    })
    .select(
      "id, template_id, template_name, subject, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .single();

  if (logError) {
    throw logError;
  }

  if (status === "failed") {
    const firstFailed = deliveries.find((delivery) => !delivery.ok);
    const errorMessage =
      typeof firstFailed?.payload?.message === "string"
        ? firstFailed.payload.message
        : "Email send failed.";
    throw new Error(errorMessage);
  }

  return {
    log: logRow as EmailLogRow,
    detail:
      status === "partial"
        ? `Email sent to ${successCount}/${deliveries.length} recipient(s).`
        : `Email sent to ${deliveries.length} recipient(s).`
  };
}

export async function resendEmailLog(input: z.infer<typeof resendEmailLogSchema>) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const sourceLog = await getEmailLogById(input.logId);

  if (!sourceLog) {
    throw new Error("Selected email log was not found.");
  }

  const recipients = await resolveRecipientsForResend(sourceLog.recipients);

  if (recipients.length === 0) {
    throw new Error("Selected email log does not contain resendable recipients.");
  }

  const deliveries = await Promise.all(
    recipients.map(async (recipient) => {
      const renderedSubject = renderTemplateValue(sourceLog.template_name, sourceLog.subject, recipient);
      const renderedMessage = renderTemplateValue(sourceLog.template_name, sourceLog.message, recipient);
      const result = await sendResendEmail({
        to: recipient.email,
        subject: renderedSubject,
        message: renderedMessage,
        recipient
      });

      return {
        userId: recipient.userId,
        email: recipient.email,
        subject: renderedSubject,
        ok: result.ok,
        id: result.id,
        payload: result.payload
      };
    })
  );

  const successCount = deliveries.filter((delivery) => delivery.ok).length;
  const status: "queued" | "failed" | "partial" | "sent" =
    successCount === deliveries.length
      ? "sent"
      : successCount === 0
        ? "failed"
        : "partial";

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("email_logs")
    .insert({
      template_id: sourceLog.template_id,
      template_name: sourceLog.template_name,
      subject: sourceLog.subject,
      message: sourceLog.message,
      recipients,
      recipient_count: recipients.length,
      status,
      provider_request_id:
        deliveries.length === 1 ? (deliveries[0]?.id ?? null) : `${successCount}/${deliveries.length}`,
      provider_response: deliveries
    })
    .select(
      "id, template_id, template_name, subject, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .single();

  if (logError) {
    throw logError;
  }

  if (status === "failed") {
    const firstFailed = deliveries.find((delivery) => !delivery.ok);
    const errorMessage =
      typeof firstFailed?.payload?.message === "string"
        ? firstFailed.payload.message
        : "Email resend failed.";
    throw new Error(errorMessage);
  }

  return {
    log: logRow as EmailLogRow,
    detail:
      status === "partial"
        ? `Email resent to ${successCount}/${deliveries.length} recipient(s).`
        : `Email resent to ${deliveries.length} recipient(s).`
  };
}
