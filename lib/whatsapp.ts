import { z } from "zod";
import {
  buildAbsoluteAccessLink,
  buildAbsoluteRedeemLink,
  decryptAccessToken
} from "@/lib/access-links";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeWhatsappPhoneNumber(phoneNumber: string) {
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.startsWith("0")) {
    return `62${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.startsWith("62")) {
    return digitsOnly;
  }

  return digitsOnly;
}

export const createWhatsappTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  message: z.string().trim().min(1).max(60000)
});

export const updateWhatsappTemplateSchema = createWhatsappTemplateSchema.extend({
  templateId: z.string().uuid()
});

export const deleteWhatsappTemplateSchema = z.object({
  templateId: z.string().uuid()
});

export const sendWhatsappSchema = z.object({
  templateId: z.string().uuid(),
  recipientUserIds: z.array(z.string().uuid()).min(1).max(10)
});

export const resendWhatsappLogSchema = z.object({
  logId: z.string().uuid()
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
    accessLink?: string;
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
  sub_mail_accounts?:
    | {
        display_email: string;
      }
    | Array<{
        display_email: string;
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

function getWhatsappTemplateRecipientMode(templateName: string | null | undefined) {
  const normalizedName = templateName?.trim().toLowerCase();

  if (normalizedName === "kode") {
    return "redeem";
  }

  if (normalizedName === "wa email") {
    return "email";
  }

  return "all";
}

function getWhatsappPrimaryLink(templateName: string | null | undefined, recipient: {
  accessLink: string;
  redeemLink: string;
}) {
  return getWhatsappTemplateRecipientMode(templateName) === "redeem"
    ? recipient.redeemLink
    : recipient.accessLink;
}

type LoggedRecipient = {
  userId: string;
  name: string;
  phoneNumber: string;
  accessLink: string;
  email: string;
  redeemCode: string | null;
  redeemLink: string;
};

type PartialLoggedRecipient = {
  userId?: string;
  name: string;
  phoneNumber: string;
  accessLink?: string;
  email?: string;
  redeemCode?: string | null;
  redeemLink?: string;
};

function getInboxEmail(relation: RecipientRow["mail_accounts"]): string {
  const mailAccount = Array.isArray(relation) ? (relation[0] ?? null) : relation ?? null;
  return mailAccount?.email_address ?? "";
}

function getDisplayEmail(row: RecipientRow): string {
  const subMailAccount = Array.isArray(row.sub_mail_accounts)
    ? (row.sub_mail_accounts[0] ?? null)
    : row.sub_mail_accounts ?? null;

  return subMailAccount?.display_email ?? getInboxEmail(row.mail_accounts);
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

export async function updateWhatsappTemplate(input: z.infer<typeof updateWhatsappTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .update({
      name: input.name,
      message: input.message
    })
    .eq("id", input.templateId)
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

export async function deleteWhatsappTemplate(input: z.infer<typeof deleteWhatsappTemplateSchema>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("whatsapp_templates")
    .delete()
    .eq("id", input.templateId);

  if (error) {
    throw error;
  }

  return { deleted: true };
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

async function getWhatsappLogById(logId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_logs")
    .select(
      "id, template_id, template_name, message, recipients, recipient_count, status, provider_request_id, provider_response, created_at"
    )
    .eq("id", logId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data as WhatsappLogRow;
}

async function listSentWhatsappRecipientUserIds() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_logs")
    .select("recipients")
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return new Set(
    ((data ?? []) as Array<{ recipients: WhatsappLogRow["recipients"] }>).flatMap((row) =>
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

export async function listWhatsappRecipients() {
  const recipients = await queryRecipients({ limit: 100, excludeSent: true });
  return recipients.map((recipient) => ({
    ...recipient,
    status: "active" as const
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

async function queryRecipients(options?: {
  recipientUserIds?: string[];
  recipientPhoneNumbers?: string[];
  limit?: number;
  excludeSent?: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("users")
    .select(
      "id, name, phone_number, status, access_token_encrypted, mail_accounts(email_address), sub_mail_accounts(display_email), redeem_code_users(assigned_at, redeem_codes(code))"
    )
    .eq("status", "active");

  if (options?.recipientUserIds?.length) {
    query = query.in("id", options.recipientUserIds);
  }

  if (options?.recipientPhoneNumbers?.length) {
    query = query.in("phone_number", options.recipientPhoneNumbers);
  }

  if (typeof options?.limit === "number") {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const origin = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const sentRecipientUserIds = options?.excludeSent
    ? await listSentWhatsappRecipientUserIds()
    : null;

  return ((data ?? []) as RecipientRow[])
    .filter((row) => !sentRecipientUserIds?.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      phoneNumber: normalizeWhatsappPhoneNumber(row.phone_number),
      email: getDisplayEmail(row),
      accessLink: buildAbsoluteAccessLink(origin, decryptAccessToken(row.access_token_encrypted)),
      redeemCode: getLatestRedeemCode(row.redeem_code_users),
      redeemLink: buildAbsoluteRedeemLink(origin, decryptAccessToken(row.access_token_encrypted))
    }));
}

async function getRecipientsByIds(recipientUserIds: string[], options?: { excludeSent?: boolean }) {
  return queryRecipients({
    recipientUserIds,
    excludeSent: options?.excludeSent ?? true
  });
}

async function resolveRecipientsForResend(sourceRecipients: WhatsappLogRow["recipients"]) {
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
      name: typeof recipient?.name === "string" ? recipient.name : "",
      phoneNumber:
        typeof recipient?.phoneNumber === "string"
          ? normalizeWhatsappPhoneNumber(recipient.phoneNumber)
          : "",
      accessLink: typeof recipient?.accessLink === "string" ? recipient.accessLink : undefined,
      email: typeof recipient?.email === "string" ? recipient.email : undefined,
      redeemCode:
        typeof recipient?.redeemCode === "string" || recipient?.redeemCode === null
          ? recipient.redeemCode
          : undefined,
      redeemLink: typeof recipient?.redeemLink === "string" ? recipient.redeemLink : undefined
    };
    })
    .filter((recipient) => recipient.name && recipient.phoneNumber);

  if (rawRecipients.length === 0) {
    return [];
  }

  const currentRecipients = await queryRecipients({
    recipientUserIds: rawRecipients
      .map((recipient) => recipient.userId)
      .filter((userId): userId is string => typeof userId === "string" && userId.length > 0),
    recipientPhoneNumbers: rawRecipients.map((recipient) => recipient.phoneNumber),
    excludeSent: false
  });
  const currentRecipientMap = new Map(
    currentRecipients.map((recipient) => [recipient.id, recipient] as const)
  );
  const currentRecipientByPhoneMap = new Map(
    currentRecipients.map((recipient) => [recipient.phoneNumber, recipient] as const)
  );

  return rawRecipients
    .map((recipient) => {
      const currentRecipient =
        (recipient.userId ? currentRecipientMap.get(recipient.userId) : null) ??
        currentRecipientByPhoneMap.get(recipient.phoneNumber);

      return {
        userId: currentRecipient?.id ?? recipient.userId ?? recipient.phoneNumber,
        name: currentRecipient?.name ?? recipient.name,
        phoneNumber: currentRecipient?.phoneNumber ?? recipient.phoneNumber,
        accessLink: recipient.accessLink ?? currentRecipient?.accessLink ?? "",
        email: recipient.email ?? currentRecipient?.email ?? "",
        redeemCode:
          recipient.redeemCode !== undefined
            ? recipient.redeemCode
            : (currentRecipient?.redeemCode ?? null),
        redeemLink: recipient.redeemLink ?? currentRecipient?.redeemLink ?? ""
      } satisfies LoggedRecipient;
    })
    .filter((recipient) => recipient.accessLink && recipient.redeemLink);
}

export async function sendWhatsappCampaign(input: z.infer<typeof sendWhatsappSchema>) {
  if (!env.FONNTE_TOKEN) {
    throw new Error("FONNTE_TOKEN is not configured.");
  }

  const template = await getTemplateById(input.templateId);
  if (!template) {
    throw new Error("Selected WhatsApp template was not found.");
  }

  const recipients = await getRecipientsByIds(input.recipientUserIds, { excludeSent: true });

  if (recipients.length !== input.recipientUserIds.length) {
    throw new Error("One or more selected recipients are invalid, inactive, or already sent.");
  }

  const target = recipients
    .map(
      (recipient) => {
        const primaryLink = getWhatsappPrimaryLink(template.name, recipient);
        return `${recipient.phoneNumber}|${recipient.name}|${recipient.phoneNumber}|${primaryLink}|${recipient.redeemCode ?? "-"}|${recipient.email || "-"}|${recipient.redeemLink}`;
      }
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
  const status: "queued" | "failed" | "partial" | "sent" = isSuccess ? "sent" : "failed";

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("whatsapp_logs")
    .insert({
      template_id: template.id,
      template_name: template.name,
      message: template.message,
      recipients: recipients.map((recipient) => ({
        userId: recipient.id,
        name: recipient.name,
        phoneNumber: recipient.phoneNumber,
        accessLink: recipient.accessLink,
        email: recipient.email,
        redeemCode: recipient.redeemCode,
        redeemLink: recipient.redeemLink
      })),
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

export async function resendWhatsappLog(input: z.infer<typeof resendWhatsappLogSchema>) {
  if (!env.FONNTE_TOKEN) {
    throw new Error("FONNTE_TOKEN is not configured.");
  }

  const sourceLog = await getWhatsappLogById(input.logId);

  if (!sourceLog) {
    throw new Error("Selected WhatsApp log was not found.");
  }

  const recipients = await resolveRecipientsForResend(sourceLog.recipients);

  if (recipients.length === 0) {
    throw new Error("Selected WhatsApp log does not contain resendable recipients.");
  }

  const target = recipients
    .map((recipient) => {
      const primaryLink = getWhatsappPrimaryLink(sourceLog.template_name, recipient);
      return `${recipient.phoneNumber}|${recipient.name}|${recipient.phoneNumber}|${primaryLink}|${recipient.redeemCode ?? "-"}|${recipient.email || "-"}|${recipient.redeemLink}`;
    })
    .join(",");
  const formData = new FormData();
  formData.set("target", target);
  formData.set(
    "message",
    sourceLog.message
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
  const status: "queued" | "failed" | "partial" | "sent" = isSuccess ? "sent" : "failed";

  const supabase = createSupabaseAdminClient();
  const { data: logRow, error: logError } = await supabase
    .from("whatsapp_logs")
    .insert({
      template_id: sourceLog.template_id,
      template_name: sourceLog.template_name,
      message: sourceLog.message,
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
          : "Fonnte resend failed.";
    throw new Error(detail);
  }

  return {
    log: logRow as WhatsappLogRow,
    detail: typeof payload?.detail === "string" ? payload.detail : "WhatsApp message queued."
  };
}
