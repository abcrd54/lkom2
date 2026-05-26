import { PageShell } from "@/components/page-shell";
import { UserAccessPage } from "@/components/user-access-page";
import { listOtpMessagesForMailAccount } from "@/lib/otp-messages";
import { getUserByAccessToken } from "@/lib/users";

type UserAccessRouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function UserAccessRoute({ params }: UserAccessRouteProps) {
  const { token } = await params;
  const user = await getUserByAccessToken(token);
  const messages =
    user && user.status === "active" && user.mailAccountId && user.inboxStatus !== "disabled"
      ? await listOtpMessagesForMailAccount(user.mailAccountId)
      : [];

  return (
    <PageShell>
      <UserAccessPage
        accessToken={token}
        user={
          user
            ? {
                id: user.id,
                name: user.name,
                provider: user.provider,
                hasInbox: Boolean(user.mailAccountId),
                inboxAddress: user.inboxAddress,
                status: user.status,
                inboxStatus: user.inboxStatus
              }
            : null
        }
        messages={messages}
      />
    </PageShell>
  );
}
