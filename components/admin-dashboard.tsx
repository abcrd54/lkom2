"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConnectProviderButton } from "@/components/connect-provider-buttons";
import { LogoutButton } from "@/components/logout-button";
import { getDashboardPath, type DashboardTab } from "@/lib/admin-dashboard";
import { cn } from "@/lib/utils";
import type { MailProvider, UserStatus } from "@/lib/types";

type MailAccountView = {
  id: string;
  provider: MailProvider;
  emailAddress: string;
  status: "active" | "reauth_required" | "disabled";
  connectedUsers: number;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserView = {
  id: string;
  name: string;
  phoneNumber: string;
  status: UserStatus;
  mailAccountId: string;
  provider: MailProvider;
  inboxAddress: string;
  inboxStatus: string;
  linkDisabledAt: string | null;
  accessToken: string;
  createdAt: string;
  updatedAt: string;
};

type OtpMessageView = {
  id: string;
  mailAccountId: string;
  providerMessageId: string;
  provider: MailProvider;
  inboxAddress: string;
  inboxStatus?: string;
  sender: string;
  recipient: string;
  subject: string;
  otpCode: string;
  bodyPreview?: string | null;
  receivedAt: string;
  createdAt?: string;
};

type AdminDashboardProps = {
  adminEmail: string | null;
  activeTab: DashboardTab;
  oauthFeedback?: {
    provider: string | null;
    status: string | null;
    message: string | null;
  };
  stats: {
    inboxCount: number;
    activeUserCount: number;
    otpCount: number;
    problematicCount: number;
  };
  mailAccounts?: MailAccountView[];
  users?: {
    items: UserView[];
    page: number;
    totalPages: number;
    total: number;
  };
  otpMessages?: {
    items: OtpMessageView[];
    page: number;
    totalPages: number;
    total: number;
  };
};

const NAV_ITEMS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  { id: "connect-mail", label: "Connect Mail" },
  { id: "manage-user", label: "Manage User" },
  { id: "otp-inbox", label: "OTP Inbox" }
];

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function providerLabel(provider: MailProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

function buildAccessPath(token: string) {
  return `/u/${token}`;
}

function buildDashboardHref(
  tab: DashboardTab,
  extras?: {
    userPage?: number;
    otpPage?: number;
  }
): Route {
  const path = getDashboardPath(tab);
  const params = new URLSearchParams();

  if (extras?.userPage && extras.userPage > 1) {
    params.set("userPage", String(extras.userPage));
  }

  if (extras?.otpPage && extras.otpPage > 1) {
    params.set("otpPage", String(extras.otpPage));
  }

  const query = params.toString();
  return (query ? `${path}?${query}` : path) as Route;
}

function Pagination({
  currentPage,
  totalPages,
  tab,
  pageParam
}: {
  currentPage: number;
  totalPages: number;
  tab: DashboardTab;
  pageParam: "userPage" | "otpPage";
}) {
  if (totalPages <= 1) {
    return null;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  function getHref(page: number) {
    return buildDashboardHref(tab, {
      userPage: pageParam === "userPage" ? page : undefined,
      otpPage: pageParam === "otpPage" ? page : undefined
    });
  }

  return (
    <div className="pagination-bar">
      <Link
        className={cn("page-link", currentPage === 1 && "disabled")}
        href={getHref(previousPage)}
        aria-disabled={currentPage === 1}
      >
        Prev
      </Link>
      <span className="page-status">
        Page {currentPage} of {totalPages}
      </span>
      <Link
        className={cn("page-link", currentPage === totalPages && "disabled")}
        href={getHref(nextPage)}
        aria-disabled={currentPage === totalPages}
      >
        Next
      </Link>
    </div>
  );
}

function OverviewSection(props: Pick<AdminDashboardProps, "stats" | "mailAccounts" | "users" | "otpMessages">) {
  return (
    <>
      <section className="small-box-grid">
        <article className="small-box blue">
          <div>
            <p>Inbox Connected</p>
            <strong>{props.stats.inboxCount}</strong>
          </div>
          <span className="small-box-icon">IN</span>
        </article>
        <article className="small-box green">
          <div>
            <p>Active Users</p>
            <strong>{props.stats.activeUserCount}</strong>
          </div>
          <span className="small-box-icon">US</span>
        </article>
        <article className="small-box amber">
          <div>
            <p>OTP Records</p>
            <strong>{props.stats.otpCount}</strong>
          </div>
          <span className="small-box-icon">#</span>
        </article>
        <article className="small-box red">
          <div>
            <p>Need Attention</p>
            <strong>{props.stats.problematicCount}</strong>
          </div>
          <span className="small-box-icon">!</span>
        </article>
      </section>

      <div className="content-grid">
        <section className="card overview-card">
          <div className="card-header">
            <div>
              <h3>Inbox Summary</h3>
              <p>Connected inboxes and current mailbox state.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table adminlte-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Inbox</th>
                  <th>Status</th>
                  <th>Users</th>
                </tr>
              </thead>
              <tbody>
                {props.mailAccounts && props.mailAccounts.length > 0 ? (
                  props.mailAccounts.slice(0, 5).map((account) => (
                    <tr key={account.id}>
                      <td>{providerLabel(account.provider)}</td>
                      <td>{account.emailAddress}</td>
                      <td>
                        <span
                          className={cn(
                            "badge",
                            account.status === "active"
                              ? "success"
                              : account.status === "reauth_required"
                                ? "warning"
                                : "neutral"
                          )}
                        >
                          {account.status}
                        </span>
                      </td>
                      <td>{account.connectedUsers}/3</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No inbox connected yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card overview-card">
          <div className="card-header">
            <div>
              <h3>User Summary</h3>
              <p>Recent users and their assigned inboxes.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table adminlte-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Inbox</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {props.users && props.users.items.length > 0 ? (
                  props.users.items.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.phoneNumber}</td>
                      <td>{user.inboxAddress}</td>
                      <td>
                        <span className={cn("badge", user.status === "active" ? "success" : "warning")}>
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No users in database yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card card-span-full overview-card-wide">
          <div className="card-header">
            <div>
              <h3>OTP Summary</h3>
              <p>Latest OTP events from connected inboxes.</p>
            </div>
          </div>
          <div className="otp-list">
            {props.otpMessages && props.otpMessages.items.length > 0 ? (
              props.otpMessages.items.map((message) => (
                <article className="otp-row" key={message.id}>
                  <div className="otp-meta">
                    <strong>{providerLabel(message.provider)}</strong>
                    <span>{message.inboxAddress}</span>
                    <span>{formatDateTime(message.receivedAt)}</span>
                  </div>
                  <div className="otp-main">
                    <h4>{message.subject || "(No subject)"}</h4>
                    <p className="micro">
                      {message.sender} to {message.recipient}
                    </p>
                  </div>
                  <div className="otp-pill">{message.otpCode}</div>
                </article>
              ))
            ) : (
              <article className="otp-row empty">
                <p className="micro">No OTP messages stored yet.</p>
              </article>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ConnectMailSection({
  mailAccounts,
  compact = false,
  fullWidth = false
}: {
  mailAccounts: MailAccountView[];
  compact?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <section className={cn("card", compact && "overview-card", fullWidth && "card-span-full")}>
      <div className="card-header">
        <div>
          <h3>Connect Mail</h3>
          <p>Add inboxes and monitor mailbox status.</p>
        </div>
        <div className="button-row">
          <ConnectProviderButton provider="google" label="Connect Google" />
          <ConnectProviderButton provider="microsoft" label="Connect Microsoft" secondary />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table adminlte-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Inbox</th>
              <th>Status</th>
              <th>User Connected</th>
              <th>Last Sync</th>
            </tr>
          </thead>
          <tbody>
            {mailAccounts.length > 0 ? (
              mailAccounts.map((account) => (
                <tr key={account.id}>
                  <td>{providerLabel(account.provider)}</td>
                  <td>{account.emailAddress}</td>
                  <td>
                    <span
                      className={cn(
                        "badge",
                        account.status === "active"
                          ? "success"
                          : account.status === "reauth_required"
                            ? "warning"
                            : "neutral"
                      )}
                    >
                      {account.status}
                    </span>
                  </td>
                  <td>{account.connectedUsers}/3</td>
                  <td>{formatDateTime(account.lastSyncAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>No inbox connected yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManageUserSection({
  users,
  mailAccounts,
  compact = false,
  fullWidth = false
}: {
  users?: AdminDashboardProps["users"];
  mailAccounts: MailAccountView[];
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mailAccountId, setMailAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAccessLink, setCreatedAccessLink] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedAccessLink(null);

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name,
          phoneNumber,
          mailAccountId
        })
      });

      const payload = (await response.json()) as
        | {
            ok: true;
            data: {
              user: UserView;
              accessLink: string;
            };
          }
        | {
            ok: false;
            error?: string;
          };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to create user." : payload.error ?? "Failed to create user.");
      }

      setSuccessMessage(`User created: ${payload.data.user.name}`);
      setCreatedAccessLink(payload.data.accessLink);
      setName("");
      setPhoneNumber("");
      setMailAccountId("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={cn("card", compact && "overview-card", fullWidth && "card-span-full")}>
      <div className="card-header">
        <div>
          <h3>Manage User</h3>
          <p>Create users and assign active inboxes.</p>
        </div>
      </div>

      <form className="form-grid admin-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Nama</label>
          <input
            id="name"
            name="name"
            placeholder="Andi Saputra"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            name="phone"
            placeholder="081234567890"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="inbox">Inbox</label>
          <select
            id="inbox"
            name="inbox"
            value={mailAccountId}
            onChange={(event) => setMailAccountId(event.target.value)}
            required
          >
            <option value="" disabled>
              Select active inbox
            </option>
            {mailAccounts
              .filter((account) => account.status !== "disabled")
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {providerLabel(account.provider)} | {account.emailAddress} ({account.connectedUsers}
                  /3 used)
                </option>
              ))}
          </select>
        </div>
        {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
        {successMessage ? (
          <div className="form-feedback success-block">
            <p className="success-title">{successMessage}</p>
            {createdAccessLink ? <p className="micro">{createdAccessLink}</p> : null}
          </div>
        ) : null}
        <div className="button-row toolbar-row">
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Adding..." : "Add User"}
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table className="data-table adminlte-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Nomor HP</th>
              <th>Provider</th>
              <th>Inbox</th>
              <th>Status</th>
              <th>Link Akses</th>
            </tr>
          </thead>
          <tbody>
            {users && users.items.length > 0 ? (
              users.items.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.phoneNumber}</td>
                  <td>{providerLabel(user.provider)}</td>
                  <td>{user.inboxAddress}</td>
                  <td>
                    <span className={cn("badge", user.status === "active" ? "success" : "warning")}>
                      {user.status}
                    </span>
                  </td>
                  <td>{buildAccessPath(user.accessToken)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>No users in database yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {users ? (
        <div className="card-footer">
          <span className="results-meta">{users.total} users total</span>
          <Pagination
            currentPage={users.page}
            totalPages={users.totalPages}
            tab="manage-user"
            pageParam="userPage"
          />
        </div>
      ) : null}
    </section>
  );
}

function OtpInboxSection({
  otpMessages,
  compact = false,
  fullWidth = false
}: {
  otpMessages?: AdminDashboardProps["otpMessages"];
  compact?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <section
      className={cn(
        "card",
        (compact || fullWidth) && "card-span-full",
        compact && "overview-card-wide"
      )}
    >
      <div className="card-header">
        <div>
          <h3>OTP Inbox</h3>
          <p>Recent OTP messages from connected inboxes.</p>
        </div>
      </div>

      <div className="otp-list">
        {otpMessages && otpMessages.items.length > 0 ? (
          otpMessages.items.map((message) => (
            <article className="otp-row" key={message.id}>
              <div className="otp-meta">
                <strong>{providerLabel(message.provider)}</strong>
                <span>{message.inboxAddress}</span>
                <span>{formatDateTime(message.receivedAt)}</span>
              </div>
              <div className="otp-main">
                <h4>{message.subject || "(No subject)"}</h4>
                <p className="micro">
                  {message.sender} to {message.recipient}
                </p>
              </div>
              <div className="otp-pill">{message.otpCode}</div>
            </article>
          ))
        ) : (
          <article className="otp-row empty">
            <p className="micro">No OTP messages stored yet.</p>
          </article>
        )}
      </div>

      {otpMessages ? (
        <div className="card-footer">
          <span className="results-meta">{otpMessages.total} OTP messages total</span>
          <Pagination
            currentPage={otpMessages.page}
            totalPages={otpMessages.totalPages}
            tab="otp-inbox"
            pageParam="otpPage"
          />
        </div>
      ) : null}
    </section>
  );
}

export function AdminDashboard({
  adminEmail,
  activeTab,
  oauthFeedback,
  stats,
  mailAccounts,
  users,
  otpMessages
}: AdminDashboardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, searchParams]);

  return (
    <div className={cn("adminlte-layout", sidebarOpen && "sidebar-open")}>
      <button
        aria-hidden={!sidebarOpen}
        className={cn("sidebar-backdrop", sidebarOpen && "visible")}
        onClick={() => setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />

      <aside className={cn("admin-sidebar", sidebarOpen && "open")}>
        <div className="sidebar-brand">
          <div className="brand-badge">OE</div>
          <div>
            <p className="sidebar-kicker">OTP Console</p>
            <h2>AdminLTE Style</h2>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              className={cn("sidebar-link", activeTab === item.id && "active")}
              href={buildDashboardHref(item.id)}
              aria-current={activeTab === item.id ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user sidebar-user-bottom">
            <div className="sidebar-avatar" aria-hidden="true">
              <svg
                className="sidebar-avatar-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
                  fill="currentColor"
                />
                <path
                  d="M4 20.5C4.86267 17.3536 7.73937 15 11 15H13C16.2606 15 19.1373 17.3536 20 20.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="sidebar-user-copy">
              <p className="sidebar-user-label">Signed in as</p>
              <strong>{adminEmail ?? "Unknown admin"}</strong>
            </div>
          </div>
          <LogoutButton className="sidebar-signout" label="Sign out" />
        </div>
      </aside>

      <div className="admin-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              className="topbar-toggle"
              onClick={() => setSidebarOpen((current) => !current)}
              type="button"
            >
              |||
            </button>
            <div>
              <h1>OTP Admin</h1>
              <p>Mail routing, users, and OTP logs.</p>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-chip">Super Admin</span>
            <span className="topbar-chip muted">{stats.inboxCount} inbox</span>
          </div>
        </header>

        <section className="content-header">
          <div>
            <h2>{NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? "Dashboard"}</h2>
            <p>
              {activeTab === "overview"
                ? "Quick view of inboxes, users, and OTP activity."
                : activeTab === "connect-mail"
                  ? "Connect and review provider inboxes."
                  : activeTab === "manage-user"
                    ? "Assign users to active inbox slots."
                    : "Review recent OTP messages."}
            </p>
          </div>
        </section>

        {oauthFeedback?.message ? (
          <section className="alert-strip">
            <span className={cn("status-dot", oauthFeedback.status === "success" ? "ok" : "warn")} />
            <strong>{oauthFeedback.provider ? oauthFeedback.provider.toUpperCase() : "OAUTH"}</strong>
            <span>{oauthFeedback.message}</span>
          </section>
        ) : null}

        {activeTab === "overview" ? (
          <OverviewSection
            stats={stats}
            mailAccounts={mailAccounts}
            users={users}
            otpMessages={otpMessages}
          />
        ) : null}

        {activeTab === "connect-mail" ? (
          <ConnectMailSection mailAccounts={mailAccounts ?? []} fullWidth />
        ) : null}

        {activeTab === "manage-user" ? (
          <ManageUserSection users={users} mailAccounts={mailAccounts ?? []} fullWidth />
        ) : null}

        {activeTab === "otp-inbox" ? <OtpInboxSection otpMessages={otpMessages} fullWidth /> : null}
      </div>
    </div>
  );
}
