import { NextResponse } from "next/server";
import { redirectToLogin, requireAdminSession } from "@/lib/auth";
import { createOAuthAuthorizationUrl } from "@/lib/oauth";

async function handleConnect(request: Request) {
  try {
    await requireAdminSession();
    const authorizationUrl = await createOAuthAuthorizationUrl("google");
    return NextResponse.redirect(authorizationUrl, { status: 303 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized.") {
      return redirectToLogin(request.url);
    }

    const url = new URL("/mail-accounts", request.url);
    url.searchParams.set("oauth_provider", "google");
    url.searchParams.set("oauth_status", "error");
    url.searchParams.set(
      "oauth_message",
      error instanceof Error ? error.message : "Failed to start Google OAuth."
    );
    return NextResponse.redirect(url);
  }
}

export async function GET(request: Request) {
  return handleConnect(request);
}

export async function POST(request: Request) {
  return handleConnect(request);
}
