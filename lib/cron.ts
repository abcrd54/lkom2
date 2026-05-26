import { env } from "@/lib/env";

export function authorizeCronRequest(request: Request) {
  if (!env.CRON_SECRET) {
    throw new Error("CRON_SECRET is not configured.");
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return true;
  }

  const url = new URL(request.url);

  if (url.searchParams.get("secret") === env.CRON_SECRET) {
    return true;
  }

  throw new Error("Unauthorized cron request.");
}
