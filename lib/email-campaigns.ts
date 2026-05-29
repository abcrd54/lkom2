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
    status?: "sent" | "failed";
    providerRequestId?: string | null;
    errorMessage?: string | null;
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
  status?: "sent" | "failed";
  providerRequestId?: string | null;
  errorMessage?: string | null;
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatEmailInlineMarkup(value: string) {
  const escaped = escapeHtml(value);
  const withBold = escaped.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");

  return withBold.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#0f62fe;text-decoration:none;font-weight:700;">$1</a>'
  );
}

function renderEmailBodyHtml(message: string) {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 1 && lines.every((line) => /^\d+\./.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\d+\.\s*/, ""))
          .map((line) => `<li style="margin:0 0 8px;">${formatEmailInlineMarkup(line)}</li>`)
          .join("");
        return `<ol style="margin:0;padding-left:20px;color:#3c4858;">${items}</ol>`;
      }

      const content = lines.map((line) => formatEmailInlineMarkup(line)).join("<br />");
      const onlyLink =
        lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0])
          ? `<div style="margin:4px 0 0;"><a href="${lines[0]}" style="display:inline-block;background:#0f62fe;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px;">Buka Akses</a></div>`
          : "";

      return `<p style="margin:0;color:#3c4858;font-size:15px;line-height:1.75;">${content}</p>${onlyLink}`;
    })
    .join('<div style="height:16px;line-height:16px;">&nbsp;</div>');
}

function renderEmailHtml(message: string) {
  return `
    <div style="margin:0;padding:32px 16px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2d3d;">
      <div style="max-width:640px;margin:0 auto;">
        <div style="margin-bottom:16px;text-align:center;">
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#e8f0ff;color:#0f62fe;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">LKOM Access</div>
        </div>
        <div style="background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">
          <div style="padding:28px 28px 18px;background:linear-gradient(135deg,#0f62fe,#3aa0ff);color:#ffffff;">
            <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;">Akses Login Anda</h1>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.88);">Buka link akses, cek OTP terbaru, lalu lanjut login dengan email.</p>
          </div>
          <div style="padding:28px;">
            ${renderEmailBodyHtml(message)}
          </div>
        </div>
        <p style="margin:16px 0 0;text-align:center;color:#6b7785;font-size:12px;line-height:1.7;">Email ini dikirim otomatis oleh sistem LKOM.</p>
      </div>
    </div>
  `;
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

function getEmailDeliveryErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;

    if (typeof value.message === "string" && value.message.length > 0) {
      return value.message;
    }

    if (typeof value.error === "string" && value.error.length > 0) {
      return value.error;
    }
  }

  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processEmailQueue<TRecipient extends {
  id?: string;
  userId?: string;
  name: string;
  email: string;
}>(input: {
  recipients: TRecipient[];
  buildMessage: (recipient: TRecipient) => {
    subject: string;
    message: string;
  };
}) {
  const deliveries: Array<{
    userId: string;
    name: string;
    email: string;
    subject: string;
    ok: boolean;
    id: string | null;
    payload: unknown;
    errorMessage: string | null;
  }> = [];

  for (let index = 0; index < input.recipients.length; index += 2) {
    const batch = input.recipients.slice(index, index + 2);
    const batchDeliveries = await Promise.all(
      batch.map(async (recipient) => {
        const rendered = input.buildMessage(recipient);
        const result = await sendResendEmail({
          to: recipient.email,
          subject: rendered.subject,
          message: rendered.message,
          recipient
        });

        return {
          userId: recipient.id ?? recipient.userId ?? recipient.email,
          name: recipient.name,
          email: recipient.email,
          subject: rendered.subject,
          ok: result.ok,
          id: result.id,
          payload: result.payload,
          errorMessage:
            result.ok
              ? null
              : getEmailDeliveryErrorMessage(result.payload, "Email send failed.")
        };
      })
    );

    deliveries.push(...batchDeliveries);

    if (index + 2 < input.recipients.length) {
      await sleep(3000);
    }
  }

  return deliveries;
}

function summarizeEmailLogStatus(
  deliveries: Array<{
    ok: boolean;
  }>
): "queued" | "failed" | "partial" | "sent" {
  const successCount = deliveries.filter((delivery) => delivery.ok).length;

  if (successCount === deliveries.length) {
    return "sent";
  }

  if (successCount === 0) {
    return "failed";
  }

  return "partial";
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
              const status = typeof value.status === "string" ? value.status : "sent";
              if (status !== "sent") {
                return null;
              }
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
        redeemLink: typeof value.redeemLink === "string" ? value.redeemLink : undefined,
        status: value.status === "failed" ? "failed" : value.status === "sent" ? "sent" : undefined,
        providerRequestId:
          typeof value.providerRequestId === "string" ? value.providerRequestId : undefined,
        errorMessage: typeof value.errorMessage === "string" ? value.errorMessage : undefined
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
        redeemLink: recipient.redeemLink ?? currentRecipient?.redeemLink ?? "",
        status:
          recipient.status === "failed"
            ? "failed"
            : recipient.status === "sent"
              ? "sent"
              : undefined,
        providerRequestId: recipient.providerRequestId,
        errorMessage: recipient.errorMessage
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

  const deliveries = await processEmailQueue({
    recipients,
    buildMessage: (recipient) => ({
      subject: renderTemplateValue(template.name, template.subject, recipient),
      message: renderTemplateValue(template.name, template.message, recipient)
    })
  });

  const successCount = deliveries.filter((delivery) => delivery.ok).length;
  const status = summarizeEmailLogStatus(deliveries);

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("email_logs")
    .insert({
      template_id: template.id,
      template_name: template.name,
      subject: template.subject,
      message: template.message,
      recipients: recipients.map((recipient) => {
        const delivery = deliveries.find((item) => item.userId === recipient.id);
        return {
        userId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        phoneNumber: recipient.phoneNumber,
        accessLink: recipient.accessLink,
        redeemCode: recipient.redeemCode,
        redeemLink: recipient.redeemLink,
        status: delivery?.ok ? "sent" : "failed",
        providerRequestId: delivery?.id ?? null,
        errorMessage: delivery?.errorMessage ?? null
      };
      }),
      recipient_count: recipients.length,
      status,
      provider_request_id: null,
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
    const errorMessage = getEmailDeliveryErrorMessage(firstFailed?.payload, "Email send failed.");
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

  const deliveries = await processEmailQueue({
    recipients,
    buildMessage: (recipient) => ({
      subject: renderTemplateValue(sourceLog.template_name, sourceLog.subject, recipient),
      message: renderTemplateValue(sourceLog.template_name, sourceLog.message, recipient)
    })
  });

  const successCount = deliveries.filter((delivery) => delivery.ok).length;
  const status = summarizeEmailLogStatus(deliveries);

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("email_logs")
    .insert({
      template_id: sourceLog.template_id,
      template_name: sourceLog.template_name,
      subject: sourceLog.subject,
      message: sourceLog.message,
      recipients: recipients.map((recipient) => {
        const delivery = deliveries.find((item) => item.userId === recipient.userId);
        return {
          ...recipient,
          status: delivery?.ok ? "sent" : "failed",
          providerRequestId: delivery?.id ?? null,
          errorMessage: delivery?.errorMessage ?? null
        };
      }),
      recipient_count: recipients.length,
      status,
      provider_request_id: null,
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
    const errorMessage = getEmailDeliveryErrorMessage(firstFailed?.payload, "Email resend failed.");
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
