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
      <section className="user-access-shell">
        <div className="user-access-card user-access-empty">
          <span className="user-access-kicker">Access</span>
          <h1 className="user-access-title">Link is not active.</h1>
          <p className="user-access-copy">
            This access link is invalid, expired, or disabled by admin.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="user-access-shell">
      <div className="user-access-hero">
        <div>
          <span className="user-access-kicker">OTP Access</span>
          <h1 className="user-access-title">{user.name}</h1>
          <p className="user-access-copy">
            OTP feed for <strong>{user.inboxAddress}</strong> via{" "}
            <strong>{providerLabel(user.provider)}</strong>.
          </p>
        </div>

        <div className="user-access-summary">
          <div className="user-summary-card">
            <span className="user-summary-label">Inbox</span>
            <strong>{user.inboxAddress}</strong>
          </div>
          <div className="user-summary-card">
            <span className="user-summary-label">Messages</span>
            <strong>{messages.length}</strong>
          </div>
        </div>
      </div>

      <div className="user-access-card">
        <div className="user-access-section-head">
          <div>
            <h2>Latest OTP</h2>
            <p>Recent codes received for this inbox.</p>
          </div>
        </div>

        <div className="user-otp-grid">
          {messages.length > 0 ? (
            messages.map((message) => (
              <article className="user-otp-card" key={message.id}>
                <div className="user-otp-head">
                  <span className="user-otp-time">{formatDateTime(message.receivedAt)}</span>
                  <span className="user-otp-badge">New</span>
                </div>
                <h3>{message.subject || "OTP Message"}</h3>
                <div className="user-otp-code">{message.otpCode}</div>
                <p className="user-otp-sender">{message.sender}</p>
              </article>
            ))
          ) : (
            <article className="user-otp-card empty">
              <h3>No OTP yet</h3>
              <p className="user-access-copy">New messages will appear here after inbox sync runs.</p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
