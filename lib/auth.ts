import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http";

export async function requireAdminSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized.");
  }

  return user;
}

export async function getAdminSessionUser() {
  if (!hasSupabaseServerConfig()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

export function redirectToLogin(requestUrl?: string) {
  const loginUrl = new URL("/login", requestUrl ?? "http://localhost");
  return NextResponse.redirect(loginUrl);
}

export function unauthorizedJson() {
  return jsonError("Unauthorized.", 401);
}
