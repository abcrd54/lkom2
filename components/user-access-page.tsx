"use client";

import { useEffect, useState } from "react";
import type { MailProvider } from "@/lib/types";

type UserAccessPageProps = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    provider: MailProvider | null;
    hasInbox: boolean;
    inboxAddress: string;
    status: "active" | "disabled";
    inboxStatus: string | null;
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
          provider: MailProvider | null;
          hasInbox: boolean;
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
  const sessionStorageKey = `otp-session-started-at:${accessToken}`;
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [liveMessages, setLiveMessages] = useState(messages);
  const [newMessageIds, setNewMessageIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [skipUnloadWarningUntil, setSkipUnloadWarningUntil] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLiveMessages(messages);
    setNewMessageIds([]);
  }, [messages]);

  useEffect(() => {
    const existingStartedAt = window.localStorage.getItem(sessionStorageKey);
    const nextStartedAt = existingStartedAt ?? new Date().toISOString();

    if (!existingStartedAt) {
      window.localStorage.setItem(sessionStorageKey, nextStartedAt);
    }

    setSessionStartedAt(nextStartedAt);
  }, [sessionStorageKey]);

  useEffect(() => {
    if (!user || user.status !== "active" || !user.hasInbox || user.inboxStatus === "disabled") {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (Date.now() < skipUnloadWarningUntil) {
        return;
      }

      event.preventDefault();
      event.returnValue =
        "Jangan reload manual. Gunakan tombol Refresh di halaman ini agar sesi OTP tetap konsisten.";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [skipUnloadWarningUntil, user]);

  useEffect(() => {
    if (
      !user ||
      user.status !== "active" ||
      !user.hasInbox ||
      user.inboxStatus === "disabled" ||
      !sessionStartedAt
    ) {
      return;
    }

    let cancelled = false;
    const startedAt = sessionStartedAt;

    async function refreshOtpMessages(showRefreshState = false) {
      if (showRefreshState) {
        setIsRefreshing(true);
      }

      try {
        const response = await fetch(
          `/api/access/${accessToken}/otp?startedAt=${encodeURIComponent(startedAt)}`,
          {
            cache: "no-store"
          }
        );
        const payload = (await response.json()) as UserAccessApiPayload;

        if (!response.ok || !payload.ok) {
          return;
        }

        if (!cancelled) {
          setLiveMessages((current) => {
            const existingIds = new Set(current.map((message) => message.id));
            const incomingNewIds = payload.data.items
              .filter((message) => !existingIds.has(message.id))
              .map((message) => message.id);

            if (incomingNewIds.length > 0) {
              setNewMessageIds((currentIds) => {
                const mergedIds = Array.from(new Set([...currentIds, ...incomingNewIds]));
                window.setTimeout(() => {
                  setNewMessageIds((latestIds) =>
                    latestIds.filter((id) => !incomingNewIds.includes(id))
                  );
                }, 12000);
                return mergedIds;
              });
            }

            return payload.data.items;
          });
        }
      } catch {
        // Keep the last known state if polling fails temporarily.
      } finally {
        if (showRefreshState) {
          setIsRefreshing(false);
        }
      }
    }

    const interval = window.setInterval(refreshOtpMessages, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, sessionStartedAt, user]);

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

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(user?.inboxAddress ?? "");
      setCopiedEmail(true);
      showToast("Email copied");
      window.setTimeout(() => {
        setCopiedEmail(false);
      }, 1800);
    } catch {
      setCopiedEmail(false);
    }
  }

  async function handleRefresh() {
    setSkipUnloadWarningUntil(Date.now() + 3000);
    setIsRefreshing(true);

    try {
      if (!sessionStartedAt) {
        throw new Error("Session not initialized.");
      }

      const response = await fetch(
        `/api/access/${accessToken}/otp?startedAt=${encodeURIComponent(sessionStartedAt)}`,
        {
          cache: "no-store"
        }
      );
      const payload = (await response.json()) as UserAccessApiPayload;

      if (!response.ok || !payload.ok) {
        throw new Error("Refresh failed.");
      }

      setLiveMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        const incomingNewIds = payload.data.items
          .filter((message) => !existingIds.has(message.id))
          .map((message) => message.id);

        if (incomingNewIds.length > 0) {
          setNewMessageIds((currentIds) => {
            const mergedIds = Array.from(new Set([...currentIds, ...incomingNewIds]));
            window.setTimeout(() => {
              setNewMessageIds((latestIds) =>
                latestIds.filter((id) => !incomingNewIds.includes(id))
              );
            }, 12000);
            return mergedIds;
          });
        }

        return payload.data.items;
      });
      showToast("OTP refreshed");
    } catch {
      showToast("Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  }

  function formatSessionStartedAt(value: string | null) {
    if (!value) {
      return null;
    }

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

  if (!user || user.status !== "active") {
    return (
      <section className="user-access-shell">
        <div className="user-access-card user-access-empty">
          <span className="user-access-kicker">Access</span>
          <h1 className="user-access-title">Link is not active.</h1>
          <p className="user-access-copy">
            This access link is invalid or has been disabled by admin.
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
          {user.hasInbox ? (
            <>
              <p className="user-access-copy">
                OTP feed for <strong>{user.inboxAddress}</strong> via{" "}
                <strong>{user.provider ? providerLabel(user.provider) : "-"}</strong>.
              </p>
              {sessionStartedAt ? (
                <p className="user-access-copy">
                  Menampilkan OTP OpenAI/ChatGPT sejak{" "}
                  <strong>{formatSessionStartedAt(sessionStartedAt)}</strong>.
                </p>
              ) : null}
              <p className="user-access-copy">
                Jangan reload halaman secara manual. Jika halaman di-refresh lewat browser, sesi OTP
                bisa berubah konteks. Gunakan tombol <strong>Refresh</strong> di bawah agar tetap aman.
              </p>
              <p className="user-access-status">{formatUpdatedAgo()}</p>
            </>
          ) : (
            <p className="user-access-copy">This account is redeem-only and does not have an OTP inbox.</p>
          )}
        </div>
      </div>

      <div className="user-access-card">
        <div className="user-access-section-head">
          <div>
            <h2>Latest OTP</h2>
            <p>{user.hasInbox ? "Recent codes received for this email." : "No inbox connected for this account."}</p>
          </div>
          {user.hasInbox ? (
            <div className="user-access-actions">
              <div className="user-summary-card user-summary-card-email">
                <div className="user-summary-card-head">
                  <span className="user-summary-label">Email</span>
                  <button
                    aria-label={copiedEmail ? "Email copied" : "Copy email"}
                    className="user-copy-icon-button"
                    onClick={handleCopyEmail}
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M9 9.75C9 8.50736 10.0074 7.5 11.25 7.5H18C19.2426 7.5 20.25 8.50736 20.25 9.75V18C20.25 19.2426 19.2426 20.25 18 20.25H11.25C10.0074 20.25 9 19.2426 9 18V9.75Z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                      <path
                        d="M5.25 15.75C4.00736 15.75 3 14.7426 3 13.5V5.25C3 4.00736 4.00736 3 5.25 3H13.5C14.7426 3 15.75 4.00736 15.75 5.25"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </button>
                </div>
                <strong>{user.inboxAddress}</strong>
              </div>
              <button className="button secondary user-refresh-button" onClick={handleRefresh} type="button">
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="user-otp-grid">
          {liveMessages.length > 0 ? (
            liveMessages.map((message) => (
              <article className="user-otp-card" key={message.id}>
                <div className="user-otp-head">
                  <span className="user-otp-time">{formatDateTime(message.receivedAt)}</span>
                  {newMessageIds.includes(message.id) ? <span className="user-otp-badge">New</span> : null}
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
              <h3>{user.hasInbox ? "No OTP yet" : "No inbox connected"}</h3>
              <p className="user-access-copy">
                {user.hasInbox
                  ? "OTP OpenAI/ChatGPT yang masuk setelah sesi ini dimulai akan muncul di sini."
                  : "This user was created for redeem access only."}
              </p>
            </article>
          )}
        </div>
      </div>
      {toastMessage ? <div className="copy-toast">{toastMessage}</div> : null}
    </section>
  );
}
