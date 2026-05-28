import { getUserByAccessToken } from "@/lib/users";
import { listOtpMessagesForMailAccount } from "@/lib/otp-messages";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

type RouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { token } = await params;
    const user = await getUserByAccessToken(token);
    const requestUrl = new URL(_.url);
    const startedAt = requestUrl.searchParams.get("startedAt");

    if (!user || user.status !== "active") {
      return jsonError("Access link is invalid or disabled.", 404);
    }

    if (!user.mailAccountId || user.inboxStatus === "disabled") {
      return jsonOk({
        user: {
          id: user.id,
          name: user.name,
          provider: user.provider,
          hasInbox: false,
          inboxAddress: user.inboxAddress
        },
        items: []
      });
    }

    const items = await listOtpMessagesForMailAccount(user.mailAccountId, 50, {
      receivedAfter: startedAt ?? undefined,
      openAiOnly: true
    });

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        provider: user.provider,
        hasInbox: true,
        inboxAddress: user.inboxAddress
      },
      sessionStartedAt: startedAt,
      items
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
