export type DashboardTab =
  | "overview"
  | "connect-mail"
  | "manage-user"
  | "otp-inbox"
  | "redeem"
  | "email"
  | "whatsapp";

export function getDashboardPath(tab: DashboardTab) {
  switch (tab) {
    case "overview":
      return "/";
    case "connect-mail":
      return "/mail-accounts";
    case "manage-user":
      return "/users";
    case "otp-inbox":
      return "/otp-inbox";
    case "redeem":
      return "/redeem";
    case "email":
      return "/email";
    case "whatsapp":
      return "/whatsapp";
  }
}

export function getSingleSearchParam(
  value: string | string[] | undefined,
  fallback?: string
) {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function readOauthFeedback(searchParams?: Record<string, string | string[] | undefined>) {
  return {
    provider: typeof searchParams?.oauth_provider === "string" ? searchParams.oauth_provider : null,
    status: typeof searchParams?.oauth_status === "string" ? searchParams.oauth_status : null,
    message: typeof searchParams?.oauth_message === "string" ? searchParams.oauth_message : null
  };
}
