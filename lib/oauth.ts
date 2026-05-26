import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { MailProvider } from "@/lib/types";

const STATE_COOKIE_PREFIX = "oauth_state_";

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
};

function getProviderConfig(provider: MailProvider): ProviderConfig {
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new Error("Google OAuth environment variables are not configured.");
    }

    return {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly"
      ]
    };
  }

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET || !env.MICROSOFT_REDIRECT_URI) {
    throw new Error("Microsoft OAuth environment variables are not configured.");
  }

  return {
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    redirectUri: env.MICROSOFT_REDIRECT_URI,
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "offline_access",
      "openid",
      "email",
      "profile",
      "https://graph.microsoft.com/Mail.Read",
      "https://graph.microsoft.com/User.Read"
    ]
  };
}

function getStateCookieName(provider: MailProvider) {
  return `${STATE_COOKIE_PREFIX}${provider}`;
}

export async function createOAuthAuthorizationUrl(provider: MailProvider) {
  const config = getProviderConfig(provider);
  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();

  cookieStore.set(getStateCookieName(provider), state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false,
    path: "/",
    maxAge: 60 * 10
  });

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return url.toString();
}

export async function verifyOAuthState(provider: MailProvider, state: string | null) {
  const cookieStore = await cookies();
  const cookieName = getStateCookieName(provider);
  const expectedState = cookieStore.get(cookieName)?.value;
  cookieStore.delete(cookieName);

  if (!state || !expectedState || state !== expectedState) {
    throw new Error("OAuth state mismatch.");
  }
}

export async function exchangeAuthorizationCode(
  provider: MailProvider,
  code: string
) {
  const config = getProviderConfig(provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
    grant_type: "authorization_code"
  });

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      typeof data?.error_description === "string"
        ? data.error_description
        : typeof data?.error === "string"
          ? data.error
          : "OAuth token exchange failed.";
    throw new Error(errorMessage);
  }

  return data as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function fetchProviderEmail(provider: MailProvider, accessToken: string) {
  const endpoint =
    provider === "google"
      ? "https://www.googleapis.com/oauth2/v2/userinfo"
      : "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail";

  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Failed to fetch authenticated mailbox profile.");
  }

  if (provider === "google") {
    if (typeof data?.email === "string" && data.email.length > 0) {
      return data.email;
    }
  } else {
    const email =
      typeof data?.mail === "string" && data.mail.length > 0
        ? data.mail
        : typeof data?.userPrincipalName === "string"
          ? data.userPrincipalName
          : null;

    if (email) {
      return email;
    }
  }

  throw new Error("Authenticated mailbox email was not returned by provider.");
}
