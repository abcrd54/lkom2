import { PageShell } from "@/components/page-shell";
import { UserAccessPage } from "@/components/user-access-page";
import { getUserByAccessToken } from "@/lib/users";

type UserAccessRouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function UserAccessRoute({ params }: UserAccessRouteProps) {
  const { token } = await params;
  const user = await getUserByAccessToken(token);

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
        messages={[]}
      />
    </PageShell>
  );
}
