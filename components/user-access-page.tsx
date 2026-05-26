"use client";

import { useEffect, useState } from "react";
import type { MailProvider } from "@/lib/types";

type UserAccessPageProps = {
  accessToken: string;
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

  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(date)} WIB`;
}

type UserAccessApiPayload =
  | {
      ok: true;
      data: {
        user: {
          id: string;
          name: string;
          provider: MailProvider;
          inboxAddress: string;
        };
        items: Array<{
          id: string;
          sender: string;
          subject: string;
          otpCode: string;
          receivedAt: string;
        }>;
      };
    }
  | {
      ok: false;
      error?: string;
    };

export function UserAccessPage({ accessToken, user, messages }: UserAccessPageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [liveMessages, setLiveMessages] = useState(messages);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!user || user.status !== "active" || user.inboxStatus === "disabled") {
      return;
    }

    let cancelled = false;

    async function refreshOtpMessages() {
      try {
        const response = await fetch(`/api/access/${accessToken}/otp`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as UserAccessApiPayload;

        if (!response.ok || !payload.ok) {
          return;
        }

        if (!cancelled) {
          setLiveMessages(payload.data.items);
        }
      } catch {
        // Keep the last known state if polling fails temporarily.
      }
    }

    const interval = window.setInterval(refreshOtpMessages, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, user]);

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 1800);
  }

  function formatUpdatedAgo() {
    if (liveMessages.length === 0) {
      return "Waiting for new OTP";
    }

    const latestTimestamp = Date.parse(liveMessages[0]?.receivedAt ?? "");
    if (Number.isNaN(latestTimestamp)) {
      return "Updated recently";
    }

    const seconds = Math.max(0, Math.floor((now - latestTimestamp) / 1000));

    if (seconds < 10) {
      return "Updated just now";
    }

    if (seconds < 60) {
      return `Updated ${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `Updated ${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    return `Updated ${hours}h ago`;
  }

  async function handleCopyOtp(otpCode: string) {
    try {
      await navigator.clipboard.writeText(otpCode);
      setCopiedCode(otpCode);
      showToast("OTP copied");
      window.setTimeout(() => {
        setCopiedCode((current) => (current === otpCode ? null : current));
      }, 1800);
    } catch {
      setCopiedCode(null);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      showToast("Access link copied");
      window.setTimeout(() => {
        setCopiedLink(false);
      }, 1800);
    } catch {
      setCopiedLink(false);
    }
  }

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
          <p className="user-access-status">{formatUpdatedAgo()}</p>
        </div>

        <div className="user-access-summary">
          <div className="user-summary-card">
            <span className="user-summary-label">Inbox</span>
            <strong>{user.inboxAddress}</strong>
          </div>
          <div className="user-summary-card">
            <span className="user-summary-label">Messages</span>
            <strong>{liveMessages.length}</strong>
          </div>
        </div>
      </div>

      <div className="user-access-card">
        <div className="user-access-section-head">
          <div>
            <h2>Latest OTP</h2>
            <p>Recent codes received for this inbox.</p>
          </div>
          <button className="button secondary" onClick={handleCopyLink} type="button">
            {copiedLink ? "Copied" : "Copy Link"}
          </button>
        </div>

        <div className="user-otp-grid">
          {liveMessages.length > 0 ? (
            liveMessages.map((message) => (
              <article className="user-otp-card" key={message.id}>
                <div className="user-otp-head">
                  <span className="user-otp-time">{formatDateTime(message.receivedAt)}</span>
                  <span className="user-otp-badge">New</span>
                </div>
                <h3>{message.subject || "OTP Message"}</h3>
                <div className="user-otp-code">{message.otpCode}</div>
                <div className="user-otp-actions">
                  <button
                    className="button"
                    onClick={() => handleCopyOtp(message.otpCode)}
                    type="button"
                  >
                    {copiedCode === message.otpCode ? "Copied" : "Copy OTP"}
                  </button>
                </div>
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
      {toastMessage ? <div className="copy-toast">{toastMessage}</div> : null}
    </section>
  );
}
