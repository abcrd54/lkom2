import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { readOauthFeedback } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary } from "@/lib/mail-accounts";
import {
  listWhatsappLogs,
  listWhatsappRecipients,
  listWhatsappTemplates
} from "@/lib/whatsapp";

type WhatsappPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [stats, templates, logs, recipients] = await Promise.all([
    getMailAccountSummary(),
    listWhatsappTemplates(),
    listWhatsappLogs(50),
    listWhatsappRecipients()
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="whatsapp"
        stats={stats}
        whatsappTemplates={templates}
        whatsappLogs={logs}
        whatsappRecipients={recipients}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
