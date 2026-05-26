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

    const items = await listOtpMessagesForMailAccount(user.mailAccountId);

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        provider: user.provider,
        hasInbox: true,
        inboxAddress: user.inboxAddress
      },
      items
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
