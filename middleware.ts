import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ADMIN_PROTECTED_PREFIXES = [
  "/",
  "/mail-accounts",
  "/users",
  "/otp-inbox",
  "/api/admin",
  "/api/users",
  "/api/providers"
];
const ADMIN_PUBLIC_PATHS = ["/login", "/u"];

function isAdminProtectedPath(pathname: string) {
  if (ADMIN_PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  return ADMIN_PROTECTED_PREFIXES.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname.startsWith(prefix)
  );
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!isAdminProtectedPath(pathname)) {
    return response;
  }

  const hasAdminSession = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));

  if (!hasAdminSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
