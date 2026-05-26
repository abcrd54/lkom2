import { AdminDashboard } from "@/components/admin-dashboard";
import { PageShell } from "@/components/page-shell";
import { parsePositiveInt, readOauthFeedback, getSingleSearchParam } from "@/lib/admin-dashboard";
import { getAdminSessionUser } from "@/lib/auth";
import { getMailAccountSummary } from "@/lib/mail-accounts";
import { listAdminOtpMessages } from "@/lib/otp-messages";

type OtpInboxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OtpInboxPage({ searchParams }: OtpInboxPageProps) {
  const user = await getAdminSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const page = parsePositiveInt(getSingleSearchParam(resolvedSearchParams?.otpPage), 1);
  const [stats, otpMessages] = await Promise.all([
    getMailAccountSummary(),
    listAdminOtpMessages({ page, limit: 20 })
  ]);

  return (
    <PageShell>
      <AdminDashboard
        adminEmail={user?.email ?? null}
        activeTab="otp-inbox"
        stats={stats}
        otpMessages={otpMessages}
        oauthFeedback={readOauthFeedback(resolvedSearchParams)}
      />
    </PageShell>
  );
}
