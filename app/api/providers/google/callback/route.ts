import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, fetchProviderEmail, verifyOAuthState } from "@/lib/oauth";
import { upsertConnectedMailAccount } from "@/lib/mail-account-connections";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = new URL("/mail-accounts", request.url);
  redirectUrl.searchParams.set("oauth_provider", "google");

  try {
    const providerError = searchParams.get("error");
    if (providerError) {
      throw new Error(providerError);
    }

    await verifyOAuthState("google", searchParams.get("state"));

    const code = searchParams.get("code");
    if (!code) {
      throw new Error("Google callback did not include an authorization code.");
    }

    const tokenData = await exchangeAuthorizationCode("google", code);
    if (!tokenData.access_token || !tokenData.refresh_token) {
      throw new Error("Google did not return both access and refresh tokens.");
    }

    const emailAddress = await fetchProviderEmail("google", tokenData.access_token);
    await upsertConnectedMailAccount({
      provider: "google",
      emailAddress,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in
    });

    redirectUrl.searchParams.set("oauth_status", "success");
    redirectUrl.searchParams.set("oauth_message", `Google inbox connected: ${emailAddress}`);
  } catch (error) {
    redirectUrl.searchParams.set("oauth_status", "error");
    redirectUrl.searchParams.set(
      "oauth_message",
      error instanceof Error ? error.message : "Google OAuth callback failed."
    );
  }

  return NextResponse.redirect(redirectUrl);
}
