import type { MailProvider } from "@/lib/types";

type UserAccessPageProps = {
  user: {
    id: string;
    name: string;
    provider: MailProvider;
    inboxAddress: string;
    status: "active" | "disabled";
    inboxStatus: string;
  } | null;
  messages: Array<{
    id: string;
    sender: string;
    subject: string;
    otpCode: string;
    receivedAt: string;
  }>;
};

function providerLabel(provider: MailProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function UserAccessPage({ user, messages }: UserAccessPageProps) {
  if (!user || user.status !== "active" || user.inboxStatus === "disabled") {
    return (
      <section className="panel panel-pad stack">
        <p className="eyebrow">Access Invalid</p>
        <h1 className="section-title">Link tidak aktif.</h1>
        <p className="section-copy">
          Link ini sudah tidak berlaku, belum terdaftar, atau user sedang di-disable oleh admin.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-pad stack">
      <div>
        <p className="eyebrow">User OTP Page</p>
        <h1 className="section-title">{user.name}</h1>
        <p className="section-copy">
          Menampilkan OTP hanya dari <strong>{user.inboxAddress}</strong> lewat provider{" "}
          <strong>{providerLabel(user.provider)}</strong>. Link ini aktif sampai admin
          menonaktifkan atau membuat link baru.
        </p>
      </div>
      <div className="otp-card-grid">
        {messages.length > 0 ? (
          messages.map((message) => (
            <article className="otp-card" key={message.id}>
              <p className="micro">{formatDateTime(message.receivedAt)}</p>
              <h3>{message.subject || "(No subject)"}</h3>
              <p className="otp-code">{message.otpCode}</p>
              <p className="micro">{message.sender}</p>
            </article>
          ))
        ) : (
          <article className="otp-card">
            <p className="micro">Belum ada OTP untuk inbox ini.</p>
          </article>
        )}
      </div>
    </section>
  );
}
