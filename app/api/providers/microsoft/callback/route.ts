import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, fetchProviderEmail, verifyOAuthState } from "@/lib/oauth";
import { upsertConnectedMailAccount } from "@/lib/mail-account-connections";

function renderPopupClosePage(redirectUrl: URL) {
  const targetUrl = JSON.stringify(redirectUrl.toString());

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Microsoft OAuth</title>
  </head>
  <body>
    <script>
      const targetUrl = ${targetUrl};
      if (window.opener && !window.opener.closed) {
        window.opener.location.href = targetUrl;
        window.close();
      } else {
        window.location.href = targetUrl;
      }
    </script>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = new URL("/mail-accounts", request.url);
  redirectUrl.searchParams.set("oauth_provider", "microsoft");

  try {
    const providerError = searchParams.get("error");
    if (providerError) {
      throw new Error(providerError);
    }

    await verifyOAuthState("microsoft", searchParams.get("state"));

    const code = searchParams.get("code");
    if (!code) {
      throw new Error("Microsoft callback did not include an authorization code.");
    }

    const tokenData = await exchangeAuthorizationCode("microsoft", code);
    if (!tokenData.access_token || !tokenData.refresh_token) {
      throw new Error("Microsoft did not return both access and refresh tokens.");
    }

    const emailAddress = await fetchProviderEmail("microsoft", tokenData.access_token);
    await upsertConnectedMailAccount({
      provider: "microsoft",
      emailAddress,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in
    });

    redirectUrl.searchParams.set("oauth_status", "success");
    redirectUrl.searchParams.set("oauth_message", `Microsoft inbox connected: ${emailAddress}`);
  } catch (error) {
    redirectUrl.searchParams.set("oauth_status", "error");
    redirectUrl.searchParams.set(
      "oauth_message",
      error instanceof Error ? error.message : "Microsoft OAuth callback failed."
    );
  }

  return renderPopupClosePage(redirectUrl);
}
