import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { type DashboardTab, readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary, listMailAccounts } from "@/lib/mail-accounts";
import { listAdminOtpMessages } from "@/lib/otp-messages";
import { listUsersPage } from "@/lib/users";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab: DashboardTab = "overview";

  const statsPromise = getMailAccountSummary();
  const [stats, mailAccounts, users, otpMessages] = await Promise.all([
    statsPromise,
    listMailAccounts(),
    listUsersPage({ page: 1, pageSize: 5 }),
    listAdminOtpMessages({ page: 1, limit: 5 })
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab={activeTab}
        stats={stats}
        mailAccounts={mailAccounts}
        users={users}
        otpMessages={otpMessages}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
