import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { parsePositiveInt, readOauthFeedback, getSingleSearchParam } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary, listMailAccounts } from "@/lib/mail-accounts";
import { listUsersPage } from "@/lib/users";

type UsersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePositiveInt(getSingleSearchParam(resolvedSearchParams?.userPage), 1);
  const [stats, mailAccounts, users] = await Promise.all([
    getMailAccountSummary(),
    listMailAccounts(),
    listUsersPage({ page, pageSize: 10 })
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="manage-user"
        stats={stats}
        mailAccounts={mailAccounts}
        users={users}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
