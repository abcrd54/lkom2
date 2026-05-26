import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listSyncableMailAccounts,
  updateMailAccountTokenState,
  type SyncableMailAccount
} from "@/lib/mail-accounts";
import type { MailProvider } from "@/lib/types";

type AccessTokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

type ParsedOtpMessage = {
  providerMessageId: string;
  sender: string;
  recipient: string;
  subject: string;
  otpCode: string;
  bodyPreview: string | null;
  receivedAt: string;
};

type MicrosoftMessage = {
  id?: string;
  subject?: string | null;
  from?: {
    emailAddress?: {
      address?: string | null;
    } | null;
  } | null;
  toRecipients?: Array<{
    emailAddress?: {
      address?: string | null;
    } | null;
  }> | null;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
  body?: {
    content?: string | null;
  } | null;
};

type SyncResult = {
  mailAccountId: string;
  provider: MailProvider;
  emailAddress: string;
  insertedCount: number;
  scannedCount: number;
  status: "synced" | "reauth_required" | "error";
  error?: string;
};

const OTP_CONTEXT_REGEX = /(?:otp|code|kode|pin|password|verification|verify)[^a-z0-9]{0,24}([a-z0-9-]{4,10})/i;
const OTP_DIGIT_REGEX = /\b\d{4,8}\b/g;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function extractOtpCode(input: string) {
  const normalized = normalizeText(input);

  const contextualMatch = normalized.match(OTP_CONTEXT_REGEX);
  if (contextualMatch?.[1]) {
    return contextualMatch[1].replace(/[^a-z0-9]/gi, "").toUpperCase();
  }

  const numericMatches = normalized.match(OTP_DIGIT_REGEX);
  if (!numericMatches || numericMatches.length === 0) {
    return null;
  }

  return numericMatches[0] ?? null;
}

function getOverlapStart(lastCheckedAt: string | null) {
  if (!lastCheckedAt) {
    return null;
  }

  const parsed = Date.parse(lastCheckedAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed - 15 * 60 * 1000);
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<AccessTokenResult> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth environment variables are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });

  const payload = await response.json();

  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error(
      typeof payload?.error_description === "string"
        ? payload.error_description
        : typeof payload?.error === "string"
          ? payload.error
          : "Google token refresh failed."
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload?.refresh_token === "string" ? payload.refresh_token : undefined,
    expiresIn: typeof payload?.expires_in === "number" ? payload.expires_in : undefined
  };
}

async function refreshMicrosoftAccessToken(refreshToken: string): Promise<AccessTokenResult> {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth environment variables are not configured.");
  }

  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read"
    }),
    cache: "no-store"
  });

  const payload = await response.json();

  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error(
      typeof payload?.error_description === "string"
        ? payload.error_description
        : typeof payload?.error === "string"
          ? payload.error
          : "Microsoft token refresh failed."
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload?.refresh_token === "string" ? payload.refresh_token : undefined,
    expiresIn: typeof payload?.expires_in === "number" ? payload.expires_in : undefined
  };
}

function flattenGooglePayloadBody(
  payload:
    | {
        mimeType?: string;
        body?: { data?: string | null };
        parts?: Array<unknown>;
      }
    | undefined
): string {
  if (!payload) {
    return "";
  }

  const bodyText = typeof payload.body?.data === "string" ? decodeBase64Url(payload.body.data) : "";
  const nested = Array.isArray(payload.parts)
    ? payload.parts
        .map((part) =>
          flattenGooglePayloadBody(
            part as {
              mimeType?: string;
              body?: { data?: string | null };
              parts?: Array<unknown>;
            }
          )
        )
        .join(" ")
    : "";

  return [bodyText, nested].filter(Boolean).join(" ");
}

async function fetchGoogleOtpMessages(
  account: SyncableMailAccount,
  accessToken: string
): Promise<ParsedOtpMessage[]> {
  const overlapStart = getOverlapStart(account.lastCheckedAt);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", "25");
  listUrl.searchParams.set("labelIds", "INBOX");
  if (overlapStart) {
    listUrl.searchParams.set("q", `after:${Math.floor(overlapStart.getTime() / 1000)}`);
  } else {
    listUrl.searchParams.set("q", "newer_than:7d");
  }

  const listResponse = await fetch(listUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const listPayload = await listResponse.json();

  if (!listResponse.ok) {
    const providerMessage =
      typeof listPayload?.error?.message === "string"
        ? listPayload.error.message
        : typeof listPayload?.error_description === "string"
          ? listPayload.error_description
          : "Failed to fetch Gmail message list.";
    throw new Error(`Gmail list failed (${listResponse.status}): ${providerMessage}`);
  }

  const messages = Array.isArray(listPayload?.messages)
    ? (listPayload.messages as Array<{ id?: string }>)
    : [];

  const detailedMessages = await Promise.all(
    messages
      .map((message) => message.id)
      .filter((id): id is string => typeof id === "string")
      .map(async (messageId) => {
        const detailUrl = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`
        );
        detailUrl.searchParams.set("format", "full");

        const detailResponse = await fetch(detailUrl, {
          headers: {
            authorization: `Bearer ${accessToken}`
          },
          cache: "no-store"
        });
        const detailPayload = await detailResponse.json();

        if (!detailResponse.ok) {
          const providerMessage =
            typeof detailPayload?.error?.message === "string"
              ? detailPayload.error.message
              : "Failed to fetch Gmail message detail.";
          throw new Error(`Gmail detail failed (${detailResponse.status}): ${providerMessage}`);
        }

        const headers = Array.isArray(detailPayload?.payload?.headers)
          ? (detailPayload.payload.headers as Array<{ name?: string; value?: string }>)
          : [];
        const headerMap = new Map(
          headers
            .filter((header) => typeof header.name === "string")
            .map((header) => [header.name!.toLowerCase(), header.value ?? ""])
        );

        const subject = normalizeText(headerMap.get("subject"));
        const sender = normalizeText(headerMap.get("from"));
        const recipient = normalizeText(headerMap.get("to")) || account.emailAddress;
        const bodyText = normalizeText(flattenGooglePayloadBody(detailPayload?.payload));
        const snippet = normalizeText(detailPayload?.snippet);
        const contentForOtp = [subject, snippet, bodyText].filter(Boolean).join(" ");
        const otpCode = extractOtpCode(contentForOtp);

        if (!otpCode) {
          return null;
        }

        const receivedAt =
          typeof detailPayload?.internalDate === "string"
            ? new Date(Number(detailPayload.internalDate)).toISOString()
            : new Date().toISOString();

        return {
          providerMessageId: messageId,
          sender,
          recipient,
          subject,
          otpCode,
          bodyPreview: normalizeText(snippet || bodyText).slice(0, 280) || null,
          receivedAt
        } satisfies ParsedOtpMessage;
      })
  );

  return detailedMessages.filter((message): message is ParsedOtpMessage => message !== null);
}

async function fetchMicrosoftOtpMessages(
  account: SyncableMailAccount,
  accessToken: string
): Promise<ParsedOtpMessage[]> {
  const overlapStart = getOverlapStart(account.lastCheckedAt);
  const listUrl = new URL("https://graph.microsoft.com/v1.0/me/messages");
  listUrl.searchParams.set(
    "$select",
    "id,subject,from,toRecipients,receivedDateTime,bodyPreview,body"
  );
  listUrl.searchParams.set("$orderby", "receivedDateTime desc");
  listUrl.searchParams.set("$top", "25");
  if (overlapStart) {
    listUrl.searchParams.set("$filter", `receivedDateTime ge ${overlapStart.toISOString()}`);
  }

  const response = await fetch(listUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const payload = await response.json();

  if (!response.ok) {
    const providerMessage =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : typeof payload?.error_description === "string"
          ? payload.error_description
          : "Failed to fetch Microsoft message list.";
    throw new Error(`Microsoft list failed (${response.status}): ${providerMessage}`);
  }

  const messages = (Array.isArray(payload?.value) ? payload.value : []) as MicrosoftMessage[];

  return messages
    .map((message: MicrosoftMessage) => {
      const subject = normalizeText(message?.subject);
      const sender = normalizeText(message?.from?.emailAddress?.address);
      const recipient =
        normalizeText(message?.toRecipients?.[0]?.emailAddress?.address) || account.emailAddress;
      const bodyPreview = normalizeText(message?.bodyPreview);
      const bodyContent =
        typeof message?.body?.content === "string" ? stripHtml(message.body.content) : "";
      const contentForOtp = [subject, bodyPreview, bodyContent].filter(Boolean).join(" ");
      const otpCode = extractOtpCode(contentForOtp);

      if (!otpCode || typeof message?.id !== "string" || typeof message?.receivedDateTime !== "string") {
        return null;
      }

      return {
        providerMessageId: message.id,
        sender,
        recipient,
        subject,
        otpCode,
        bodyPreview: bodyPreview.slice(0, 280) || normalizeText(bodyContent).slice(0, 280) || null,
        receivedAt: new Date(message.receivedDateTime).toISOString()
      } satisfies ParsedOtpMessage;
    })
    .filter((message: ParsedOtpMessage | null): message is ParsedOtpMessage => message !== null);
}

async function upsertOtpMessages(mailAccountId: string, messages: ParsedOtpMessage[]) {
  if (messages.length === 0) {
    return 0;
  }

  const supabase = createSupabaseAdminClient();
  const payload = messages.map((message) => ({
    mail_account_id: mailAccountId,
    provider_message_id: message.providerMessageId,
    sender: message.sender || "(Unknown sender)",
    recipient: message.recipient || "",
    subject: message.subject || "",
    otp_code: message.otpCode,
    body_preview: message.bodyPreview,
    received_at: message.receivedAt
  }));

  const { error } = await supabase
    .from("otp_messages")
    .upsert(payload, { onConflict: "mail_account_id,provider_message_id", ignoreDuplicates: true });

  if (error) {
    throw error;
  }

  return payload.length;
}

function isReauthError(message: string) {
  return /invalid_grant|interaction_required|invalid_request|token/i.test(message);
}

async function syncSingleMailAccount(account: SyncableMailAccount): Promise<SyncResult> {
  try {
    const tokenResult =
      account.provider === "google"
        ? await refreshGoogleAccessToken(account.refreshToken)
        : await refreshMicrosoftAccessToken(account.refreshToken);

    const tokenExpiresAt =
      typeof tokenResult.expiresIn === "number"
        ? new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString()
        : account.tokenExpiresAt;

    if (tokenResult.refreshToken || tokenExpiresAt) {
      await updateMailAccountTokenState({
        mailAccountId: account.id,
        refreshToken: tokenResult.refreshToken,
        tokenExpiresAt,
        status: "active"
      });
    }

    const messages =
      account.provider === "google"
        ? await fetchGoogleOtpMessages(account, tokenResult.accessToken)
        : await fetchMicrosoftOtpMessages(account, tokenResult.accessToken);

    const insertedCount = await upsertOtpMessages(account.id, messages);
    await updateMailAccountTokenState({
      mailAccountId: account.id,
      lastCheckedAt: new Date().toISOString(),
      status: "active"
    });

    return {
      mailAccountId: account.id,
      provider: account.provider,
      emailAddress: account.emailAddress,
      insertedCount,
      scannedCount: messages.length,
      status: "synced"
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Inbox sync failed.";

    if (isReauthError(errorMessage)) {
      await updateMailAccountTokenState({
        mailAccountId: account.id,
        status: "reauth_required",
        lastCheckedAt: new Date().toISOString()
      });

      return {
        mailAccountId: account.id,
        provider: account.provider,
        emailAddress: account.emailAddress,
        insertedCount: 0,
        scannedCount: 0,
        status: "reauth_required",
        error: errorMessage
      };
    }

    return {
      mailAccountId: account.id,
      provider: account.provider,
      emailAddress: account.emailAddress,
      insertedCount: 0,
      scannedCount: 0,
      status: "error",
      error: errorMessage
    };
  }
}

export async function syncConnectedInboxes() {
  const accounts = await listSyncableMailAccounts();
  const results: SyncResult[] = [];

  for (const account of accounts) {
    results.push(await syncSingleMailAccount(account));
  }

  return {
    syncedAt: new Date().toISOString(),
    accountCount: accounts.length,
    insertedCount: results.reduce((sum, result) => sum + result.insertedCount, 0),
    scannedCount: results.reduce((sum, result) => sum + result.scannedCount, 0),
    results
  };
}
