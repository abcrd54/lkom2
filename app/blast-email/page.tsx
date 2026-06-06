import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary } from "@/lib/mail-accounts";

type BlastEmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BlastEmailPage({ searchParams }: BlastEmailPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const stats = await getMailAccountSummary();

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="blast-email"
        stats={stats}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
