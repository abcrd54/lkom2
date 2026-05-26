import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary } from "@/lib/mail-accounts";
import { listRedeemCodes } from "@/lib/redeem-codes";
import { listUsers } from "@/lib/users";

type RedeemPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RedeemPage({ searchParams }: RedeemPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [stats, redeemCodes, redeemUsers] = await Promise.all([
    getMailAccountSummary(),
    listRedeemCodes(),
    listUsers()
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="redeem"
        stats={stats}
        redeemCodes={redeemCodes}
        redeemUsers={redeemUsers}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
