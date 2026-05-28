import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import {
  listEmailLogs,
  listEmailRecipients,
  listEmailTemplates
} from "@/lib/email-campaigns";
import { getMailAccountSummary } from "@/lib/mail-accounts";

type EmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmailPage({ searchParams }: EmailPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [stats, templates, logs, recipients] = await Promise.all([
    getMailAccountSummary(),
    listEmailTemplates(),
    listEmailLogs(50),
    listEmailRecipients()
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="email"
        stats={stats}
        emailTemplates={templates}
        emailLogs={logs}
        emailRecipients={recipients}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
