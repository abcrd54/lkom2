import { env } from "@/lib/env";
import { getRedeemCodeForUser } from "@/lib/redeem-codes";
import {
  asProviderPayload,
  type ProviderPayload,
  type RedeemLookupResult
} from "@/lib/redeem-access-shared";
import { getUserByAccessToken } from "@/lib/users";

function buildRedeemQueryUrl(code: string) {
  const template =
    env.REDEEM_QUERY_URL_TEMPLATE ??
    "https://gptplus.lol/api/exchange/query?keyword={code}";

  if (template.includes("{code}")) {
    return template.replace("{code}", encodeURIComponent(code));
  }

  const url = new URL(template);
  url.searchParams.set("keyword", code);
  return url.toString();
}

function buildRedeemEmailCodeUrl(email: string) {
  const template =
    env.REDEEM_EMAIL_CODE_URL_TEMPLATE ??
    "https://gptplus.lol/api/exchange/code?email={email}";

  if (template.includes("{email}")) {
    return template.replace("{email}", encodeURIComponent(email));
  }

  const url = new URL(template);
  url.searchParams.set("email", email);
  return url.toString();
}

async function fetchFlexible(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json, text/plain;q=0.9, */*;q=0.8"
    }
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = await response.text();
  }

  return {
    response,
    payload
  };
}

function extractEmailCode(payload: unknown): string | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    const match = payload.match(/\b\d{4,8}\b/);
    return match?.[0] ?? null;
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directKeys = ["emailCode", "code", "otp", "otpCode", "value"];

  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nestedRecord = nestedData as Record<string, unknown>;
    for (const key of directKeys) {
      const value = nestedRecord[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

export async function queryRedeemAccess(
  token: string,
  options?: { refreshOtp?: boolean }
): Promise<RedeemLookupResult | null> {
  const user = await getUserByAccessToken(token);

  if (!user || user.status !== "active") {
    return null;
  }

  const code = await getRedeemCodeForUser(user.id);

  if (!code) {
    return {
      ok: false,
      code: "-",
      userName: user.name,
      queryUrl: null,
      refreshUrl: null,
      errorMessage: "Kode redeem belum dipasang untuk pengguna ini."
    };
  }

  const queryUrl = buildRedeemQueryUrl(code);

  try {
    const { response, payload } = await fetchFlexible(queryUrl);
    const providerPayload = asProviderPayload(payload);
    const accountEmail = providerPayload?.accountEmail?.trim() || user.inboxAddress || "";
    const refreshUrl = accountEmail ? buildRedeemEmailCodeUrl(accountEmail) : null;

    if (!response.ok) {
      return {
        ok: false,
        code,
        userName: user.name,
        queryUrl,
        refreshUrl,
        errorMessage: "Provider redeem mengembalikan respons error.",
        payload
      };
    }

    let finalPayload: ProviderPayload | unknown = payload;

    if (options?.refreshOtp && refreshUrl) {
      const refreshResult = await fetchFlexible(refreshUrl);
      const refreshedEmailCode = extractEmailCode(refreshResult.payload);

      if (providerPayload) {
        finalPayload = {
          ...providerPayload,
          emailCode: refreshedEmailCode ?? providerPayload.emailCode ?? null,
          refreshedEmailCode,
          refreshPayload: refreshResult.payload
        };
      } else {
        finalPayload = {
          payload,
          refreshedEmailCode,
          refreshPayload: refreshResult.payload
        };
      }
    }

    return {
      ok: true,
      code,
      userName: user.name,
      queryUrl,
      refreshUrl,
      payload: finalPayload
    };
  } catch (error) {
    return {
      ok: false,
      code,
      userName: user.name,
      queryUrl,
      refreshUrl: null,
      errorMessage:
        error instanceof Error ? error.message : "Gagal menghubungi provider redeem."
    };
  }
}
