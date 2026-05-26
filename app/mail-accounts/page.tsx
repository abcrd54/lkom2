import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary, listMailAccounts } from "@/lib/mail-accounts";

type MailAccountsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MailAccountsPage({ searchParams }: MailAccountsPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [stats, mailAccounts] = await Promise.all([getMailAccountSummary(), listMailAccounts()]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="connect-mail"
        stats={stats}
        mailAccounts={mailAccounts}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
