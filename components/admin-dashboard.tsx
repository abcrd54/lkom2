"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { ConnectProviderButton } from "@/components/connect-provider-buttons";
import { BlastEmailSection } from "@/components/blast-email-section";
import { LogoutButton } from "@/components/logout-button";
import { RedeemSection } from "@/components/redeem-section";
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
  subAccounts: Array<{
    id: string;
    mailAccountId: string;
    label: string;
    displayEmail: string;
    maxUsers: number;
    connectedUsers: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

type UserView = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  status: UserStatus;
  mailAccountId: string | null;
  subMailAccountId: string | null;
  subMailAccountLabel: string;
  provider: MailProvider | null;
  inboxAddress: string;
  sourceInboxAddress: string;
  inboxStatus: string | null;
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

type RedeemCodeView = {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  usedSlots: number;
  remainingSlots: number;
  assignments: Array<{
    id: string;
    userId: string;
    assignedAt: string;
    user: {
      id: string;
      name: string;
      phoneNumber: string;
      status: UserStatus;
    } | null;
  }>;
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
    searchQuery?: string;
  };
  otpMessages?: {
    items: OtpMessageView[];
    page: number;
    totalPages: number;
    total: number;
  };
  redeemCodes?: RedeemCodeView[];
  redeemUsers?: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    status: UserStatus;
  }>;
  emailTemplates?: Array<{
    id: string;
    name: string;
    subject: string;
    message: string;
    createdAt: string;
    updatedAt: string;
  }>;
  emailLogs?: Array<{
    id: string;
    templateId: string | null;
    templateName: string;
    subject: string;
    message: string;
    recipients: Array<{
      userId: string;
      name: string;
      email: string;
      phoneNumber?: string;
      accessLink?: string;
      redeemCode?: string | null;
      redeemLink?: string;
      status?: "sent" | "failed";
      providerRequestId?: string | null;
      errorMessage?: string | null;
    }>;
    recipientCount: number;
    status: "queued" | "sent" | "failed" | "partial";
    providerRequestId: string | null;
    providerResponse: unknown;
    createdAt: string;
  }>;
  emailRecipients?: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    email: string;
    accessLink: string;
    redeemCode: string | null;
    redeemLink: string;
  }>;
  whatsappTemplates?: Array<{
    id: string;
    name: string;
    message: string;
    createdAt: string;
    updatedAt: string;
  }>;
  whatsappLogs?: Array<{
    id: string;
    templateId: string | null;
    templateName: string;
    message: string;
    recipients: Array<{
      userId: string;
      name: string;
      phoneNumber: string;
      accessLink?: string;
      email?: string;
      redeemCode?: string | null;
      redeemLink?: string;
    }>;
    recipientCount: number;
    status: "queued" | "sent" | "failed" | "partial";
    providerRequestId: string | null;
    providerResponse: unknown;
    createdAt: string;
  }>;
  whatsappRecipients?: Array<{
    id: string;
    name: string;
    phoneNumber: string;
    email: string;
    status: "active" | "disabled";
    accessLink: string;
    redeemCode: string | null;
    redeemLink: string;
  }>;
};

const NAV_ITEMS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  { id: "connect-mail", label: "Connect Mail" },
  { id: "manage-user", label: "Manage User" },
  { id: "otp-inbox", label: "OTP Inbox" },
  { id: "redeem", label: "Redeem" },
  { id: "email", label: "Kirim Email" },
  { id: "blast-email", label: "Blast Email" },
  { id: "whatsapp", label: "Kirim WhatsApp" }
];

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Never";
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

function providerLabel(provider: MailProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

function userProviderLabel(provider: MailProvider | null) {
  if (!provider) {
    return "Redeem";
  }

  return providerLabel(provider);
}

function buildUserPath(token: string, hasInbox: boolean) {
  return hasInbox ? `/u/${token}` : `/r/${token}`;
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
            <p>Email Connected</p>
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
                      <td>{account.connectedUsers} active</td>
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
  const router = useRouter();
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [selectedMailAccountId, setSelectedMailAccountId] = useState("");
  const [subLabel, setSubLabel] = useState("");
  const [subDisplayEmail, setSubDisplayEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const googleAccounts = mailAccounts.filter(
    (account) => account.provider === "google" && account.status !== "disabled"
  );
  const itemsPerPage = 10;
  const totalEmailSlots = mailAccounts.length + mailAccounts.reduce((sum, account) => sum + account.subAccounts.length, 0);
  const totalPages = Math.max(1, Math.ceil(mailAccounts.length / itemsPerPage));
  const paginatedAccounts = mailAccounts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, Math.ceil(mailAccounts.length / itemsPerPage))));
  }, [mailAccounts.length]);

  function resetSubForm() {
    setSelectedMailAccountId("");
    setSubLabel("");
    setSubDisplayEmail("");
    setErrorMessage(null);
    setFeedback(null);
    setIsSubmitting(false);
  }

  function openSubModal() {
    resetSubForm();
    setIsSubModalOpen(true);
  }

  function closeSubModal() {
    setIsSubModalOpen(false);
    resetSubForm();
  }

  async function handleCreateSubMail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/sub-mail-accounts/create", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          mailAccountId: selectedMailAccountId,
          label: subLabel,
          displayEmail: subDisplayEmail,
          maxUsers: 4
        })
      });

      const payload = (await response.json()) as
        | {
            ok: true;
            data: {
              subMailAccount: {
                label: string;
                displayEmail: string;
              };
            };
          }
        | {
            ok: false;
            error?: string;
          };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to create sub account." : payload.error ?? "Failed to create sub account.");
      }

      setFeedback(
        `Sub-Gmail created: ${payload.data.subMailAccount.label} (${payload.data.subMailAccount.displayEmail})`
      );
      setSubLabel("");
      setSubDisplayEmail("");
      setSelectedMailAccountId("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create sub account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={cn("card", compact && "overview-card", fullWidth && "card-span-full")}>
      <div className="card-header">
        <div>
          <h3>Connect Mail</h3>
          <p>Add inboxes and monitor mailbox status.</p>
          <p className="micro">{totalEmailSlots} total connected email slot(s) from primary and sub email.</p>
        </div>
        <div className="button-row">
          <ConnectProviderButton provider="google" label="Connect Google" />
          <ConnectProviderButton provider="microsoft" label="Connect Microsoft" secondary />
          <button
            className="button secondary"
            disabled={googleAccounts.length === 0}
            onClick={openSubModal}
            type="button"
          >
            Add Sub-Gmail
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table adminlte-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Provider</th>
              <th>Inbox</th>
              <th>Status</th>
              <th>User Connected</th>
              <th>Sub-Gmail</th>
              <th>Last Sync</th>
            </tr>
          </thead>
          <tbody>
            {mailAccounts.length > 0 ? (
              paginatedAccounts.map((account, index) => (
                <tr key={account.id}>
                  <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
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
                  <td>{account.connectedUsers} active</td>
                  <td>
                    {account.subAccounts.length > 0 ? (
                      <div className="log-recipient-list">
                        {account.subAccounts.map((subAccount) => (
                          <span key={subAccount.id}>
                            {subAccount.label}: {subAccount.displayEmail} ({subAccount.connectedUsers}/
                            {subAccount.maxUsers})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="micro">No sub accounts</span>
                    )}
                  </td>
                  <td>{formatDateTime(account.lastSyncAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>No inbox connected yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mailAccounts.length > 0 ? (
        <div className="card-footer">
          <span className="results-meta">
            {mailAccounts.length} primary inbox | {totalEmailSlots} total email slot(s)
          </span>
          <div className="pagination-bar">
            <button
              className={cn("page-link", currentPage === 1 && "disabled")}
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              Prev
            </button>
            <span className="page-status">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className={cn("page-link", currentPage === totalPages && "disabled")}
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {isSubModalOpen ? (
        <div className="modal-backdrop" onClick={closeSubModal} role="presentation">
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <div>
                <h3>Add Sub-Gmail</h3>
                <p>Create one logical Gmail slot with its own 4-user capacity.</p>
              </div>
              <button className="modal-close" onClick={closeSubModal} type="button">
                Close
              </button>
            </div>

            <form className="form-grid modal-form" onSubmit={handleCreateSubMail}>
              <div className="field">
                <label htmlFor="sub-gmail-parent">Google inbox</label>
                <select
                  id="sub-gmail-parent"
                  value={selectedMailAccountId}
                  onChange={(event) => setSelectedMailAccountId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select parent Gmail
                  </option>
                  {googleAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.emailAddress}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sub-gmail-label">Label</label>
                <input
                  id="sub-gmail-label"
                  placeholder="Alias B"
                  value={subLabel}
                  onChange={(event) => setSubLabel(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="sub-gmail-email">Display email</label>
                <input
                  id="sub-gmail-email"
                  placeholder="aboutlko.m@gmail.com"
                  value={subDisplayEmail}
                  onChange={(event) => setSubDisplayEmail(event.target.value)}
                  required
                />
              </div>
              {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
              {feedback ? (
                <div className="form-feedback success-block">
                  <p className="success-title">{feedback}</p>
                </div>
              ) : null}
              <div className="button-row">
                <button className="button" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Create Sub-Gmail"}
                </button>
                <button className="button secondary" onClick={closeSubModal} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
  const [modalMode, setModalMode] = useState<"single" | "bulk" | null>(null);
  const [userSearch, setUserSearch] = useState(users?.searchQuery ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [subMailAccountId, setSubMailAccountId] = useState("");
  const [codeRedeem, setCodeRedeem] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAccessLink, setCreatedAccessLink] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<
    Array<{ name: string; userEmail: string; phoneNumber: string; otpInbox: string; codeRedeem: string }>
  >([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    successCount: number;
    partialCount: number;
    failedCount: number;
    partialSummary: Array<{
      reason: string;
      count: number;
    }>;
    failedSummary: Array<{
      reason: string;
      count: number;
    }>;
    partial: Array<{
      row: number;
      name: string;
      userEmail: string;
      phoneNumber: string;
      otpInbox: string;
      codeRedeem: string;
      reason: string;
    }>;
    failed: Array<{
      row: number;
      name: string;
      userEmail: string;
      phoneNumber: string;
      otpInbox: string;
      codeRedeem: string;
      reason: string;
    }>;
  } | null>(null);

  const activeMailAccounts = mailAccounts.filter((account) => account.status !== "disabled");
  const selectableSubAccounts = activeMailAccounts.flatMap((account) =>
    account.subAccounts.map((subAccount) => ({
      ...subAccount,
      provider: account.provider,
      sourceInboxAddress: account.emailAddress
    }))
  );
  const [copiedAccessUserId, setCopiedAccessUserId] = useState<string | null>(null);
  const rowNumberOffset = users ? (users.page - 1) * 10 : 0;
  const filteredUsers =
    users?.items.filter((user) => {
      const query = userSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.phoneNumber.toLowerCase().includes(query) ||
        user.inboxAddress.toLowerCase().includes(query)
      );
    }) ?? [];

  function resetSingleFormState() {
    setName("");
    setEmail("");
    setPhoneNumber("");
    setSubMailAccountId("");
    setCodeRedeem("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatedAccessLink(null);
    setIsSubmitting(false);
  }

  function resetBulkState() {
    setBulkRows([]);
    setBulkFileName(null);
    setBulkProgress(null);
    setBulkResult(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  }

  function closeModal() {
    setModalMode(null);
    resetSingleFormState();
    resetBulkState();
  }

  function openSingleModal() {
    resetBulkState();
    resetSingleFormState();
    setModalMode("single");
  }

  function openBulkModal() {
    resetSingleFormState();
    resetBulkState();
    setModalMode("bulk");
  }

  async function handleCopyAccessLink(token: string, userId: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${buildUserPath(token, Boolean(users?.items.find((item) => item.id === userId)?.mailAccountId))}`
      );
      setCopiedAccessUserId(userId);
      window.setTimeout(() => {
        setCopiedAccessUserId((current) => (current === userId ? null : current));
      }, 1800);
    } catch {
      setCopiedAccessUserId(null);
    }
  }

  function downloadTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["name", "user_email", "phoneNumber", "otp_inbox", "code_redeem"],
      ["", "", "", "", ""]
    ]);

    worksheet["B2"] = {
      t: "s",
      v: "andi@example.com"
    };
    worksheet["C2"] = {
      t: "s",
      v: "628123456789"
    };
    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 30 },
      { wch: 20 },
      { wch: 32 },
      { wch: 24 }
    ];

    const noteSheet = XLSX.utils.aoa_to_sheet([
      ["Notes"],
      ["user_email is the destination email used by the Email campaign menu."],
      ["Format phoneNumber as plain text and use the 628xxxx format."],
      ["Example: 628123456789"],
      ["otp_inbox can be a parent Gmail, Sub-Gmail, or Microsoft inbox."],
      ["Leave code_redeem empty unless the row should use a redeem code."]
    ]);
    noteSheet["!cols"] = [{ wch: 72 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "users");
    XLSX.utils.book_append_sheet(workbook, noteSheet, "notes");
    XLSX.writeFile(workbook, "user-import-template.xlsx");
  }

  function normalizeHeaderKey(value: string) {
    return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
  }

  function hasScientificNotation(value: string) {
    return /^\d+(\.\d+)?e[+-]?\d+$/i.test(value.trim());
  }

  async function parseBulkFile(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("Import file does not contain any worksheet.");
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(worksheet, {
      defval: "",
      raw: false
    });

    const parsedRows = rawRows
      .map((row) => {
        const normalizedEntries = Object.entries(row).reduce<Record<string, string>>(
          (accumulator, [key, value]) => {
            accumulator[normalizeHeaderKey(key)] = String(value ?? "").trim();
            return accumulator;
          },
          {}
        );

        return {
          name: normalizedEntries.name ?? "",
          userEmail:
            normalizedEntries.useremail ??
            normalizedEntries.email ??
            normalizedEntries.contactemail ??
            "",
          phoneNumber: normalizedEntries.phonenumber ?? "",
          otpInbox:
            normalizedEntries.otpinbox ??
            normalizedEntries.emailconnect ??
            normalizedEntries.inboxemail ??
            normalizedEntries.inbox ??
            "",
          codeRedeem:
            normalizedEntries.coderedeem ??
            normalizedEntries.redeemcode ??
            normalizedEntries.code ??
            ""
        };
      })
      .filter((row) => row.name || row.userEmail || row.phoneNumber || row.otpInbox || row.codeRedeem);

    if (parsedRows.length === 0) {
      throw new Error("Import file is empty or template headers are invalid.");
    }

    const scientificPhoneRows = parsedRows
      .map((row, index) => ({ rowNumber: index + 2, phoneNumber: row.phoneNumber }))
      .filter((row) => hasScientificNotation(row.phoneNumber));

    if (scientificPhoneRows.length > 0) {
      const previewRows = scientificPhoneRows
        .slice(0, 5)
        .map((row) => row.rowNumber)
        .join(", ");
      const extraCount = scientificPhoneRows.length - Math.min(scientificPhoneRows.length, 5);
      const extraLabel = extraCount > 0 ? ` and ${extraCount} more` : "";

      throw new Error(
        `Phone numbers use scientific notation on row ${previewRows}${extraLabel}. Format the phoneNumber column as Text before exporting CSV/XLSX.`
      );
    }

    const invalidRow = parsedRows.find(
      (row) => !row.name || !row.userEmail || !row.phoneNumber || (!row.otpInbox && !row.codeRedeem)
    );

    if (invalidRow) {
      throw new Error(
        "Each import row must include name, user_email, phoneNumber, and at least one of otp_inbox or code_redeem."
      );
    }

    return parsedRows;
  }

  async function handleBulkFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setBulkResult(null);

    try {
      const parsedRows = await parseBulkFile(file);
      setBulkRows(parsedRows);
      setBulkFileName(file.name);
    } catch (error) {
      setBulkRows([]);
      setBulkFileName(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse import file.");
    }
  }

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
          email,
          phoneNumber,
          subMailAccountId: subMailAccountId || null,
          codeRedeem
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
      setEmail("");
      setPhoneNumber("");
      setSubMailAccountId("");
      setCodeRedeem("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkImport() {
    if (bulkRows.length === 0) {
      setErrorMessage("Upload a CSV/XLS/XLSX file before importing.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setBulkResult(null);

    try {
      setBulkProgress(`Importing ${bulkRows.length} row(s)...`);
      const response = await fetch("/api/users/bulk-import", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ rows: bulkRows })
      });

      const payload = (await response.json()) as
        | {
            ok: true;
            data: {
              successCount: number;
              partialCount: number;
              failedCount: number;
              partialSummary: Array<{
                reason: string;
                count: number;
              }>;
              failedSummary: Array<{
                reason: string;
                count: number;
              }>;
              partial: Array<{
                row: number;
                name: string;
                userEmail: string;
                phoneNumber: string;
                otpInbox: string;
                codeRedeem: string;
                reason: string;
              }>;
              failed: Array<{
                row: number;
                name: string;
                userEmail: string;
                phoneNumber: string;
                otpInbox: string;
                codeRedeem: string;
                reason: string;
              }>;
            };
          }
        | {
            ok: false;
            error?: string;
          };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to import users." : payload.error ?? "Failed to import users.");
      }

      setBulkResult(payload.data);
      setBulkProgress(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to import users.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={cn("card", compact && "overview-card", fullWidth && "card-span-full")}>
        <div className="card-header">
          <div>
            <h3>Manage User</h3>
            <p>Create inbox users or standalone redeem-only users.</p>
          </div>
        <div className="button-row">
          <button className="button" onClick={openSingleModal} type="button">
            Add User
          </button>
          <button className="button secondary" onClick={openBulkModal} type="button">
            Bulk Import
          </button>
        </div>
      </div>
      <div className="toolbar-inline table-toolbar">
        <div className="field search-field">
          <label htmlFor="user-search">Search user</label>
          <input
            id="user-search"
            name="user-search"
            placeholder="Search name, email, phone, or inbox"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table adminlte-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Nama</th>
              <th>User Email</th>
              <th>Nomor HP</th>
              <th>Provider</th>
              <th>Inbox</th>
              <th>Status</th>
              <th>Link Akses</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{rowNumberOffset + index + 1}</td>
                  <td>{user.name}</td>
                  <td>{user.email || "-"}</td>
                  <td>{user.phoneNumber}</td>
                  <td>{userProviderLabel(user.provider)}</td>
                  <td>
                    {user.inboxAddress ? (
                      <div className="log-recipient-list">
                        <span>
                          {user.subMailAccountLabel}: {user.inboxAddress}
                        </span>
                        {user.sourceInboxAddress && user.sourceInboxAddress !== user.inboxAddress ? (
                          <span>Source inbox: {user.sourceInboxAddress}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="micro">Redeem only</span>
                    )}
                  </td>
                  <td>
                    <span className={cn("badge", user.status === "active" ? "success" : "warning")}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <div className="access-link-cell">
                      <span>{buildUserPath(user.accessToken, Boolean(user.mailAccountId))}</span>
                      <button
                        className="mini-button"
                        onClick={() => handleCopyAccessLink(user.accessToken, user.id)}
                        type="button"
                      >
                        {copiedAccessUserId === user.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  {users?.items.length ? "No users match your search." : "No users in database yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {users ? (
        <div className="card-footer">
          <span className="results-meta">{users.total} users total | 10 per page</span>
          <Pagination
            currentPage={users.page}
            totalPages={users.totalPages}
            tab="manage-user"
            pageParam="userPage"
          />
        </div>
      ) : null}

      {modalMode ? (
        <div className="modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <div>
                <h3>{modalMode === "single" ? "Add User" : "Bulk Import"}</h3>
                <p>
                  {modalMode === "single"
                    ? "Create one inbox user or one standalone redeem-only user."
                    : "Upload XLSX, XLS, or CSV using the import template headers."}
                </p>
              </div>
              <button className="modal-close" onClick={closeModal} type="button">
                Close
              </button>
            </div>

            {modalMode === "single" ? (
              <form className="form-grid modal-form" onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="modal-name">Name</label>
                  <input
                    id="modal-name"
                    name="name"
                    placeholder="Andi Saputra"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modal-email">User Email</label>
                  <input
                    id="modal-email"
                    name="email"
                    placeholder="andi@example.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modal-phone">Phone</label>
                  <input
                    id="modal-phone"
                    name="phone"
                    placeholder="628123456789"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modal-inbox">Sub account</label>
                  <select
                    id="modal-inbox"
                    name="inbox"
                    value={subMailAccountId}
                    onChange={(event) => setSubMailAccountId(event.target.value)}
                  >
                    <option value="">
                      No sub account
                    </option>
                    {selectableSubAccounts.map((subAccount) => (
                      <option key={subAccount.id} value={subAccount.id}>
                        {providerLabel(subAccount.provider)} | {subAccount.label} |{" "}
                        {subAccount.displayEmail} ({subAccount.connectedUsers}/{subAccount.maxUsers} used)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="modal-code-redeem">Code redeem</label>
                  <input
                    id="modal-code-redeem"
                    name="codeRedeem"
                    placeholder="ABC123"
                    value={codeRedeem}
                    onChange={(event) => setCodeRedeem(event.target.value)}
                  />
                </div>
                <p className="micro">
                  Use sub account for OTP users. If no sub account is selected, `code_redeem` is
                  required and the user becomes redeem-only.
                </p>
                {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
                {successMessage ? (
                  <div className="form-feedback success-block">
                    <p className="success-title">{successMessage}</p>
                    {createdAccessLink ? <p className="micro">{createdAccessLink}</p> : null}
                  </div>
                ) : null}
                <div className="button-row">
                  <button className="button" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Adding..." : "Create User"}
                  </button>
                  <button className="button secondary" onClick={closeModal} type="button">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="form-grid modal-form">
                <div className="button-row">
                  <button className="button secondary" onClick={downloadTemplate} type="button">
                    Download Template
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="bulk-file">Import file</label>
                  <input
                    id="bulk-file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleBulkFileChange}
                  />
                </div>
                <div className="import-template-note">
                  Template headers:
                  <code>name,user_email,phoneNumber,otp_inbox,code_redeem</code>
                </div>
                <p className="micro">
                  Use `user_email` as the destination email for the Email campaign menu.
                </p>
                <p className="micro">
                  Use `otp_inbox` from any connected inbox address: parent Gmail, Sub-Gmail,
                  or Microsoft inbox. Leave it empty only when the row should create a redeem-only user.
                </p>
                <p className="micro">Use `phoneNumber` in `628xxxx` format and prefer the XLSX template.</p>
                {bulkFileName ? (
                  <p className="micro">
                    {bulkFileName} | {bulkRows.length} row(s) ready
                  </p>
                ) : null}
                {bulkProgress ? <p className="micro">{bulkProgress}</p> : null}
                {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
                {bulkResult ? (
                  <div className="form-feedback success-block">
                    <p className="success-title">
                      {bulkResult.successCount} success | {bulkResult.partialCount} partial |{" "}
                      {bulkResult.failedCount} failed
                    </p>
                    {bulkResult.partialSummary.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.partialSummary.map((item) => (
                          <p className="micro" key={`partial-summary-${item.reason}`}>
                            Partial summary | {item.count} row(s): {item.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {bulkResult.failedSummary.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.failedSummary.map((item) => (
                          <p className="micro" key={`failed-summary-${item.reason}`}>
                            Failed summary | {item.count} row(s): {item.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {bulkResult.partial.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.partial.map((partialRow) => (
                          <p
                            className="micro"
                            key={`partial-${partialRow.row}-${partialRow.phoneNumber}-${partialRow.reason}`}
                          >
                            Partial Row {partialRow.row} | {partialRow.name} |{" "}
                            {partialRow.userEmail} | {partialRow.phoneNumber} | {partialRow.otpInbox || "-"} |{" "}
                            {partialRow.codeRedeem || "-"}: {partialRow.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {bulkResult.failed.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.failed.map((failedRow) => (
                          <p
                            className="micro"
                            key={`${failedRow.row}-${failedRow.phoneNumber}-${failedRow.reason}`}
                          >
                            Row {failedRow.row} | {failedRow.name} | {failedRow.userEmail} | {failedRow.phoneNumber} |{" "}
                            {failedRow.otpInbox || "-"} | {failedRow.codeRedeem || "-"}:{" "}
                            {failedRow.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="button-row">
                  <button
                    className="button"
                    disabled={isSubmitting || bulkRows.length === 0}
                    onClick={handleBulkImport}
                    type="button"
                  >
                    {isSubmitting ? "Importing..." : "Start Import"}
                  </button>
                  <button className="button secondary" onClick={closeModal} type="button">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmailSection({
  templates = [],
  logs = [],
  recipients = []
}: {
  templates?: NonNullable<AdminDashboardProps["emailTemplates"]>;
  logs?: NonNullable<AdminDashboardProps["emailLogs"]>;
  recipients?: NonNullable<AdminDashboardProps["emailRecipients"]>;
}) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null);
  const [resendLogId, setResendLogId] = useState<string | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [sendProgress, setSendProgress] = useState<{
    requestId: string;
    processedCount: number;
    sentCount: number;
    failedCount: number;
    totalCount: number;
    status: "queued" | "sent" | "failed" | "partial";
  } | null>(null);
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const recipientMode =
    selectedTemplate?.name.trim().toLowerCase() === "kode"
      ? ("redeem" as const)
      : ("email" as const);
  const templateRecipients = recipients.filter((recipient) => {
    if (recipientMode === "redeem") {
      return Boolean(recipient.redeemCode);
    }

    return Boolean(recipient.email.trim());
  });
  const filteredRecipients = templateRecipients.filter((recipient) => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      recipient.name.toLowerCase().includes(query) ||
      recipient.email.toLowerCase().includes(query) ||
      recipient.phoneNumber.toLowerCase().includes(query)
    );
  });
  const selectedRecipients = templateRecipients.filter((recipient) =>
    selectedRecipientIds.includes(recipient.id)
  );
  const resendLog = logs.find((log) => log.id === resendLogId) ?? null;
  const estimatedQueueSeconds =
    selectedRecipientIds.length > 0 ? Math.max(0, Math.ceil(selectedRecipientIds.length / 2) - 1) * 3 : 0;

  useEffect(() => {
    setRecipientSearch("");
    setSelectedRecipientIds(templateRecipients.map((recipient) => recipient.id));
  }, [selectedTemplateId, recipientMode, recipients]);

  useEffect(() => {
    if (!sendProgress || sendProgress.status !== "queued") {
      return;
    }

    const requestId = sendProgress.requestId;
    let isCancelled = false;

    async function pollProgress() {
      try {
        const response = await fetch(`/api/email/progress?requestId=${encodeURIComponent(requestId)}`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok || !payload?.ok || !payload?.data?.progress || isCancelled) {
          return;
        }

        const progress = payload.data.progress as {
          requestId?: string;
          processedCount: number;
          sentCount: number;
          failedCount: number;
          totalCount: number;
          status: "queued" | "sent" | "failed" | "partial";
        };

        setSendProgress((current) => {
          if (!current || current.requestId !== requestId) {
            return current;
          }

          return {
            requestId: current.requestId,
            processedCount: progress.processedCount,
            sentCount: progress.sentCount,
            failedCount: progress.failedCount,
            totalCount: progress.totalCount,
            status: progress.status
          };
        });
      } catch {
        return;
      }
    }

    void pollProgress();
    const intervalId = window.setInterval(() => {
      void pollProgress();
    }, 1000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [sendProgress?.requestId, sendProgress?.status]);

  function resetTemplateForm() {
    setTemplateName("");
    setTemplateSubject("");
    setTemplateMessage("");
    setEditingTemplateId(null);
  }

  function renderEmailTemplateValue(
    templateName: string,
    value: string,
    recipient: {
      name: string;
      phoneNumber: string;
      email: string;
      accessLink: string;
      redeemCode: string | null;
      redeemLink: string;
    }
  ) {
    const previewMode = templateName.trim().toLowerCase() === "kode" ? "redeem" : "email";
    const primaryLink = previewMode === "redeem" ? recipient.redeemLink : recipient.accessLink;

    return value
      .replaceAll("{name}", recipient.name)
      .replaceAll("{phone}", recipient.phoneNumber)
      .replaceAll("{email}", recipient.email || "-")
      .replaceAll("{link}", primaryLink)
      .replaceAll("{code}", recipient.redeemCode ?? "-")
      .replaceAll("{redeem_link}", recipient.redeemLink);
  }

  function toggleRecipient(recipientId: string) {
    setSelectedRecipientIds((current) => {
      if (current.includes(recipientId)) {
        return current.filter((id) => id !== recipientId);
      }

      return [...current, recipientId];
    });
  }

  function selectAllRecipients() {
    setSelectedRecipientIds(filteredRecipients.map((recipient) => recipient.id));
  }

  function clearSelectedRecipients() {
    setSelectedRecipientIds([]);
  }

  function openResendModal(logId: string) {
    setResendLogId(logId);
    setSendErrorMessage(null);
    setSendFeedback(null);
  }

  function closeResendModal() {
    if (isResendingEmail) {
      return;
    }

    setResendLogId(null);
  }

  function handleEditTemplate(template: {
    id: string;
    name: string;
    subject: string;
    message: string;
  }) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateMessage(template.message);
    setErrorMessage(null);
    setFeedback(null);
  }

  async function handleSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingTemplate(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/email/templates", {
        method: editingTemplateId ? "PUT" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId: editingTemplateId,
          name: templateName,
          subject: templateSubject,
          message: templateMessage
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to save email template.");
      }

      setFeedback(
        editingTemplateId
          ? `Template updated: ${payload.data.template.name}`
          : `Template saved: ${payload.data.template.name}`
      );
      resetTemplateForm();
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save email template.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    setDeletingTemplateId(templateId);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/email/templates", {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to delete email template.");
      }

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId("");
      }

      if (editingTemplateId === templateId) {
        resetTemplateForm();
      }

      setFeedback("Template deleted.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete email template.");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function handleSendEmail() {
    setIsSendingEmail(true);
    setSendErrorMessage(null);
    setSendFeedback(null);
    const requestId = crypto.randomUUID();
    setSendProgress({
      requestId,
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      totalCount: selectedRecipientIds.length,
      status: "queued"
    });

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          recipientUserIds: selectedRecipientIds,
          clientRequestId: requestId
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to send email.");
      }

      try {
        const progressResponse = await fetch(
          `/api/email/progress?requestId=${encodeURIComponent(requestId)}`,
          {
            cache: "no-store"
          }
        );
        const progressPayload = await progressResponse.json();

        if (progressResponse.ok && progressPayload?.ok && progressPayload?.data?.progress) {
          const progress = progressPayload.data.progress as {
            processedCount: number;
            sentCount: number;
            failedCount: number;
            totalCount: number;
            status: "queued" | "sent" | "failed" | "partial";
          };
          setSendProgress({
            requestId,
            processedCount: progress.processedCount,
            sentCount: progress.sentCount,
            failedCount: progress.failedCount,
            totalCount: progress.totalCount,
            status: progress.status
          });
        }
      } catch {
        // Keep the live counter if the final refresh cannot be fetched.
      }
      setSendFeedback(payload.data.detail ?? "Email sent.");
      setSelectedRecipientIds([]);
      router.refresh();
    } catch (error) {
      try {
        const progressResponse = await fetch(
          `/api/email/progress?requestId=${encodeURIComponent(requestId)}`,
          {
            cache: "no-store"
          }
        );
        const progressPayload = await progressResponse.json();

        if (progressResponse.ok && progressPayload?.ok && progressPayload?.data?.progress) {
          const progress = progressPayload.data.progress as {
            processedCount: number;
            sentCount: number;
            failedCount: number;
            totalCount: number;
            status: "queued" | "sent" | "failed" | "partial";
          };
          setSendProgress({
            requestId,
            processedCount: progress.processedCount,
            sentCount: progress.sentCount,
            failedCount: progress.failedCount,
            totalCount: progress.totalCount,
            status: progress.status
          });
        }
      } catch {
        // Keep the last visible progress state if follow-up polling fails.
      }
      setSendErrorMessage(error instanceof Error ? error.message : "Failed to send email.");
    } finally {
      setIsSendingEmail(false);
    }
  }

  async function handleResendEmail() {
    if (!resendLog) {
      return;
    }

    setIsResendingEmail(true);
    setSendErrorMessage(null);
    setSendFeedback(null);

    try {
      const response = await fetch("/api/email/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          logId: resendLog.id
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to resend email.");
      }

      setSendFeedback(payload.data.detail ?? "Email resent.");
      setResendLogId(null);
      router.refresh();
    } catch (error) {
      setSendErrorMessage(error instanceof Error ? error.message : "Failed to resend email.");
    } finally {
      setIsResendingEmail(false);
    }
  }

  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h3>Email Template</h3>
            <p>Create reusable email templates for access links.</p>
          </div>
        </div>
        <form className="form-grid admin-form" onSubmit={handleSaveTemplate}>
          <div className="field">
            <label htmlFor="email-template-name">Template name</label>
            <input
              id="email-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Akses OTP"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email-template-subject">Subject</label>
            <input
              id="email-template-subject"
              value={templateSubject}
              onChange={(event) => setTemplateSubject(event.target.value)}
              placeholder="Link akses OTP Anda"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email-template-message">Message</label>
            <textarea
              id="email-template-message"
              className="admin-textarea"
              value={templateMessage}
              onChange={(event) => setTemplateMessage(event.target.value)}
              placeholder="Halo {name}, buka link ini: {link}"
              required
            />
          </div>
          <div className="import-template-note">
            Available variables:
            <code>{`{name}`}</code>
            <code>{`{phone}`}</code>
            <code>{`{email}`}</code>
            <code>{`{link}`}</code>
            <code>{`{code}`}</code>
            <code>{`{redeem_link}`}</code>
          </div>
          {templates.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table adminlte-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subject</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.subject}</td>
                      <td>{formatDateTime(template.updatedAt)}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            onClick={() => handleEditTemplate(template)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button secondary"
                            disabled={deletingTemplateId === template.id}
                            onClick={() => handleDeleteTemplate(template.id)}
                            type="button"
                          >
                            {deletingTemplateId === template.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
          {feedback ? (
            <div className="form-feedback success-block">
              <p className="success-title">{feedback}</p>
            </div>
          ) : null}
          <div className="button-row toolbar-row">
            <button className="button" disabled={isSavingTemplate} type="submit">
              {isSavingTemplate
                ? "Saving..."
                : editingTemplateId
                  ? "Update Template"
                  : "Save Template"}
            </button>
            {editingTemplateId ? (
              <button className="button secondary" onClick={resetTemplateForm} type="button">
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h3>Kirim Email</h3>
            <p>Send one template to the selected recipients through Resend.</p>
          </div>
        </div>
        <div className="form-grid admin-form">
          <div className="field">
            <label htmlFor="email-template-select">Template</label>
            <select
              id="email-template-select"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          {selectedTemplate ? (
            <p className="micro">
              {recipientMode === "redeem"
                ? "Template KODE akan memakai redeem link sebagai {link}."
                : "Template email akan memakai access link sebagai {link}."}
            </p>
          ) : null}
          {selectedTemplate ? (
            <div className="template-preview-block">
              <div className="template-preview-head">
                <strong>Template Preview</strong>
                <span>{selectedTemplate.name}</span>
              </div>
              <div className="template-preview-grid">
                {(selectedRecipients.length > 0 ? selectedRecipients : templateRecipients.slice(0, 1)).map(
                  (recipient) => (
                    <article className="template-preview-card" key={recipient.id}>
                      <p className="micro">
                        {recipient.name} | {recipient.email}
                      </p>
                      <p className="micro">
                        Subject:{" "}
                        {renderEmailTemplateValue(selectedTemplate.name, selectedTemplate.subject, recipient)}
                      </p>
                      <pre className="template-preview-message">
                        {renderEmailTemplateValue(selectedTemplate.name, selectedTemplate.message, recipient)}
                      </pre>
                    </article>
                  )
                )}
              </div>
            </div>
          ) : null}
          <div className="field search-field">
            <label htmlFor="email-recipient-search">Search recipient</label>
            <input
              id="email-recipient-search"
              value={recipientSearch}
              onChange={(event) => setRecipientSearch(event.target.value)}
              placeholder="Search active users"
            />
          </div>
          <div className="recipient-meta">Selected {selectedRecipientIds.length} recipient(s)</div>
          {selectedRecipientIds.length > 0 ? (
            <p className="micro">
              Sending uses a queue of 2 email(s) every 3 seconds. Estimated duration: about{" "}
              <strong>
                {estimatedQueueSeconds > 0 ? `${estimatedQueueSeconds}-${estimatedQueueSeconds + 3} seconds` : "under 3 seconds"}
              </strong>
              .
            </p>
          ) : null}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={filteredRecipients.length === 0}
              onClick={selectAllRecipients}
              type="button"
            >
              Select All
            </button>
            <button
              className="button secondary"
              disabled={selectedRecipientIds.length === 0}
              onClick={clearSelectedRecipients}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="recipient-list">
            {filteredRecipients.map((recipient) => (
              <label className="recipient-item" key={recipient.id}>
                <input
                  type="checkbox"
                  checked={selectedRecipientIds.includes(recipient.id)}
                  onChange={() => toggleRecipient(recipient.id)}
                />
                <span>
                  <strong>{recipient.name}</strong>
                  <small>{recipient.email}</small>
                </span>
              </label>
            ))}
          </div>
          {sendErrorMessage ? <p className="form-feedback error">{sendErrorMessage}</p> : null}
          {sendFeedback ? (
            <div className="form-feedback success-block">
              <p className="success-title">{sendFeedback}</p>
            </div>
          ) : null}
          {isSendingEmail ? (
            <div className="template-preview-block">
              <p className="micro">
                Sending in queue. Keep this page open while the selected recipients are processed.
              </p>
              {sendProgress ? (
                <p className="micro">
                  Progress:{" "}
                  <strong>
                    {sendProgress.processedCount}/{sendProgress.totalCount}
                  </strong>{" "}
                  processed | sent {sendProgress.sentCount} | failed {sendProgress.failedCount}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="button-row toolbar-row">
            <button
              className="button"
              disabled={!selectedTemplateId || selectedRecipientIds.length === 0 || isSendingEmail}
              onClick={handleSendEmail}
              type="button"
            >
              {isSendingEmail ? "Sending..." : "Send Email"}
            </button>
          </div>
        </div>
      </section>

      <section className="card card-span-full">
        <div className="card-header">
          <div>
            <h3>Email Log</h3>
            <p>Delivery history sent through Resend.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table adminlte-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Template</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Request ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.templateName}</td>
                    <td>
                      <div className="log-recipient-list">
                        {log.recipients.map((recipient) => (
                          <span key={`${log.id}-${recipient.userId}`}>
                            {recipient.name} ({recipient.email}){" "}
                            [{recipient.status === "failed" ? "failed" : "sent"}]
                            {recipient.errorMessage ? ` - ${recipient.errorMessage}` : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "badge",
                          log.status === "failed"
                            ? "warning"
                            : log.status === "queued"
                              ? "neutral"
                              : "success"
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <div className="log-recipient-list">
                        {log.recipients.map((recipient) => (
                          <span key={`${log.id}-${recipient.userId}-request`}>
                            {recipient.name}: {recipient.providerRequestId ?? "-"}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => openResendModal(log.id)}
                        type="button"
                      >
                        Resend
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No email logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {resendLog ? (
        <div className="modal-backdrop" onClick={closeResendModal} role="presentation">
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <div>
                <h3>Preview Resend</h3>
                <p>{resendLog.templateName} | {resendLog.recipients.length} recipient(s)</p>
              </div>
              <button className="modal-close" onClick={closeResendModal} type="button">
                Close
              </button>
            </div>
            <div className="form-grid modal-form">
              <div className="template-preview-block">
                <div className="template-preview-head">
                  <strong>Template Preview</strong>
                  <span>{resendLog.templateName}</span>
                </div>
                <div className="template-preview-grid">
                  {resendLog.recipients.map((recipient) => (
                    <article className="template-preview-card" key={`${resendLog.id}-${recipient.userId}`}>
                      <p className="micro">
                        {recipient.name} | {recipient.email}
                      </p>
                      <p className="micro">
                        Subject: {renderEmailTemplateValue(resendLog.templateName, resendLog.subject, {
                          name: recipient.name,
                          phoneNumber: recipient.phoneNumber ?? "-",
                          email: recipient.email,
                          accessLink: recipient.accessLink ?? recipient.redeemLink ?? "-",
                          redeemCode: recipient.redeemCode ?? null,
                          redeemLink: recipient.redeemLink ?? recipient.accessLink ?? "-"
                        })}
                      </p>
                      <pre className="template-preview-message">
                        {renderEmailTemplateValue(resendLog.templateName, resendLog.message, {
                          name: recipient.name,
                          phoneNumber: recipient.phoneNumber ?? "-",
                          email: recipient.email,
                          accessLink: recipient.accessLink ?? recipient.redeemLink ?? "-",
                          redeemCode: recipient.redeemCode ?? null,
                          redeemLink: recipient.redeemLink ?? recipient.accessLink ?? "-"
                        })}
                      </pre>
                    </article>
                  ))}
                </div>
              </div>
              {sendErrorMessage ? <p className="form-feedback error">{sendErrorMessage}</p> : null}
              <div className="button-row">
                <button
                  className="button"
                  disabled={isResendingEmail}
                  onClick={handleResendEmail}
                  type="button"
                >
                  {isResendingEmail ? "Resending..." : "Confirm Resend"}
                </button>
                <button
                  className="button secondary"
                  disabled={isResendingEmail}
                  onClick={closeResendModal}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WhatsappSection({
  templates = [],
  logs = [],
  recipients = []
}: {
  templates?: NonNullable<AdminDashboardProps["whatsappTemplates"]>;
  logs?: NonNullable<AdminDashboardProps["whatsappLogs"]>;
  recipients?: NonNullable<AdminDashboardProps["whatsappRecipients"]>;
}) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null);
  const [resendLogId, setResendLogId] = useState<string | null>(null);
  const [isResendingWhatsapp, setIsResendingWhatsapp] = useState(false);
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const recipientMode = (() => {
    const normalizedTemplateName = selectedTemplate?.name.trim().toLowerCase();

    if (normalizedTemplateName === "kode") {
      return "redeem" as const;
    }

    if (normalizedTemplateName === "wa email") {
      return "email" as const;
    }

    return "all" as const;
  })();
  const templateRecipients = recipients.filter((recipient) => {
    if (recipientMode === "redeem") {
      return Boolean(recipient.redeemCode);
    }

    if (recipientMode === "email") {
      return Boolean(recipient.email.trim());
    }

    return true;
  });

  const filteredRecipients = templateRecipients.filter((recipient) => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      recipient.name.toLowerCase().includes(query) ||
      recipient.phoneNumber.toLowerCase().includes(query)
    );
  });
  const selectedRecipients = templateRecipients.filter((recipient) =>
    selectedRecipientIds.includes(recipient.id)
  );
  const resendLog = logs.find((log) => log.id === resendLogId) ?? null;

  useEffect(() => {
    setRecipientSearch("");
    setSelectedRecipientIds(templateRecipients.slice(0, 10).map((recipient) => recipient.id));
  }, [selectedTemplateId, recipientMode, recipients]);

  function resetTemplateForm() {
    setTemplateName("");
    setTemplateMessage("");
    setEditingTemplateId(null);
  }

  function renderWhatsappTemplatePreview(
    templateName: string,
    message: string,
    recipient: {
      name: string;
      phoneNumber: string;
      email?: string;
      accessLink?: string;
      redeemCode?: string | null;
      redeemLink?: string;
    }
  ) {
    const previewMode = (() => {
      const normalizedTemplateName = templateName.trim().toLowerCase();

      if (normalizedTemplateName === "kode") {
        return "redeem" as const;
      }

      if (normalizedTemplateName === "wa email") {
        return "email" as const;
      }

      return "all" as const;
    })();
    const primaryLink =
      previewMode === "redeem"
        ? recipient.redeemLink ?? recipient.accessLink ?? "-"
        : recipient.accessLink ?? recipient.redeemLink ?? "-";

    return message
      .replaceAll("{name}", recipient.name)
      .replaceAll("{phone}", recipient.phoneNumber)
      .replaceAll("{email}", recipient.email || "-")
      .replaceAll("{link}", primaryLink)
      .replaceAll("{code}", recipient.redeemCode ?? "-")
      .replaceAll("{redeem_link}", recipient.redeemLink ?? recipient.accessLink ?? "-");
  }

  function toggleRecipient(recipientId: string) {
    setSelectedRecipientIds((current) => {
      if (current.includes(recipientId)) {
        return current.filter((id) => id !== recipientId);
      }

      if (current.length >= 10) {
        return current;
      }

      return [...current, recipientId];
    });
  }

  function selectFirstTenRecipients() {
    setSelectedRecipientIds(filteredRecipients.slice(0, 10).map((recipient) => recipient.id));
  }

  function clearSelectedRecipients() {
    setSelectedRecipientIds([]);
  }

  function openResendModal(logId: string) {
    setResendLogId(logId);
    setSendErrorMessage(null);
    setSendFeedback(null);
  }

  function closeResendModal() {
    if (isResendingWhatsapp) {
      return;
    }

    setResendLogId(null);
  }

  function handleEditTemplate(template: {
    id: string;
    name: string;
    message: string;
  }) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateMessage(template.message);
    setErrorMessage(null);
    setFeedback(null);
  }

  async function handleSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingTemplate(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: editingTemplateId ? "PUT" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId: editingTemplateId,
          name: templateName,
          message: templateMessage
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to save WhatsApp template.");
      }

      setFeedback(
        editingTemplateId
          ? `Template updated: ${payload.data.template.name}`
          : `Template saved: ${payload.data.template.name}`
      );
      resetTemplateForm();
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save WhatsApp template.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    setDeletingTemplateId(templateId);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to delete WhatsApp template.");
      }

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId("");
      }

      if (editingTemplateId === templateId) {
        resetTemplateForm();
      }

      setFeedback("Template deleted.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete WhatsApp template."
      );
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function handleSendWhatsapp() {
    setIsSendingWhatsapp(true);
    setSendErrorMessage(null);
    setSendFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          recipientUserIds: selectedRecipientIds
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to send WhatsApp message.");
      }

      setSendFeedback(payload.data.detail ?? "WhatsApp message queued.");
      setSelectedRecipientIds([]);
      router.refresh();
    } catch (error) {
      setSendErrorMessage(
        error instanceof Error ? error.message : "Failed to send WhatsApp message."
      );
    } finally {
      setIsSendingWhatsapp(false);
    }
  }

  async function handleResendWhatsapp() {
    if (!resendLog) {
      return;
    }

    setIsResendingWhatsapp(true);
    setSendErrorMessage(null);
    setSendFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          logId: resendLog.id
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to resend WhatsApp message.");
      }

      setSendFeedback(payload.data.detail ?? "WhatsApp message queued.");
      setResendLogId(null);
      router.refresh();
    } catch (error) {
      setSendErrorMessage(
        error instanceof Error ? error.message : "Failed to resend WhatsApp message."
      );
    } finally {
      setIsResendingWhatsapp(false);
    }
  }

  return (
    <div className="content-grid">
      <section className="card">
        <div className="card-header">
          <div>
            <h3>Chat Template</h3>
            <p>Create reusable WhatsApp message templates.</p>
          </div>
        </div>
        <form className="form-grid admin-form" onSubmit={handleSaveTemplate}>
          <div className="field">
            <label htmlFor="wa-template-name">Template name</label>
            <input
              id="wa-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="OTP Reminder"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="wa-template-message">Message</label>
            <textarea
              id="wa-template-message"
              className="admin-textarea"
              value={templateMessage}
              onChange={(event) => setTemplateMessage(event.target.value)}
              placeholder="Halo, OTP terbaru Anda sudah tersedia."
              required
            />
          </div>
          <div className="import-template-note">
            Available variables:
            <code>{`{name}`}</code>
            <code>{`{phone}`}</code>
            <code>{`{email}`}</code>
            <code>{`{link}`}</code>
            <code>{`{code}`}</code>
            <code>{`{redeem_link}`}</code>
          </div>
          {templates.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table adminlte-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{formatDateTime(template.updatedAt)}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            onClick={() => handleEditTemplate(template)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button secondary"
                            disabled={deletingTemplateId === template.id}
                            onClick={() => handleDeleteTemplate(template.id)}
                            type="button"
                          >
                            {deletingTemplateId === template.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
          {feedback ? (
            <div className="form-feedback success-block">
              <p className="success-title">{feedback}</p>
            </div>
          ) : null}
          <div className="button-row toolbar-row">
            <button className="button" disabled={isSavingTemplate} type="submit">
              {isSavingTemplate
                ? "Saving..."
                : editingTemplateId
                  ? "Update Template"
                  : "Save Template"}
            </button>
            {editingTemplateId ? (
              <button className="button secondary" onClick={resetTemplateForm} type="button">
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h3>Kirim WhatsApp</h3>
            <p>Send one template to up to 10 recipients.</p>
          </div>
        </div>
        <div className="form-grid admin-form">
          <div className="field">
            <label htmlFor="wa-template-select">Template</label>
            <select
              id="wa-template-select"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          {selectedTemplate ? (
            <p className="micro">
              {recipientMode === "redeem"
                ? "Template KODE otomatis memfilter dan memilih user redeem."
                : recipientMode === "email"
                  ? "Template WA EMAIL otomatis memfilter dan memilih user yang punya inbox/email."
                  : "Template ini menampilkan semua recipient aktif."}
            </p>
          ) : null}
          {selectedTemplate ? (
            <div className="template-preview-block">
              <div className="template-preview-head">
                <strong>Template Preview</strong>
                <span>{selectedTemplate.name}</span>
              </div>
              <div className="template-preview-grid">
                {(
                  selectedRecipients.length > 0
                    ? selectedRecipients
                    : templateRecipients.slice(0, 1)
                ).map((recipient) => (
                  <article className="template-preview-card" key={recipient.id}>
                    <p className="micro">
                      {recipient.name} | {recipient.phoneNumber}
                    </p>
                    <pre className="template-preview-message">
                      {renderWhatsappTemplatePreview(selectedTemplate.name, selectedTemplate.message, recipient)}
                    </pre>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          <div className="field search-field">
            <label htmlFor="wa-recipient-search">Search recipient</label>
            <input
              id="wa-recipient-search"
              value={recipientSearch}
              onChange={(event) => setRecipientSearch(event.target.value)}
              placeholder="Search active users"
            />
          </div>
          <div className="recipient-meta">
            Selected {selectedRecipientIds.length}/10 recipient(s)
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={filteredRecipients.length === 0}
              onClick={selectFirstTenRecipients}
              type="button"
            >
              Select 10
            </button>
            <button
              className="button secondary"
              disabled={selectedRecipientIds.length === 0}
              onClick={clearSelectedRecipients}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="recipient-list">
            {filteredRecipients.map((recipient) => (
              <label className="recipient-item" key={recipient.id}>
                <input
                  type="checkbox"
                  checked={selectedRecipientIds.includes(recipient.id)}
                  onChange={() => toggleRecipient(recipient.id)}
                  disabled={
                    !selectedRecipientIds.includes(recipient.id) &&
                    selectedRecipientIds.length >= 10
                  }
                />
                <span>
                  <strong>{recipient.name}</strong>
                  <small>{recipient.phoneNumber}</small>
                </span>
              </label>
            ))}
          </div>
          {sendErrorMessage ? <p className="form-feedback error">{sendErrorMessage}</p> : null}
          {sendFeedback ? (
            <div className="form-feedback success-block">
              <p className="success-title">{sendFeedback}</p>
            </div>
          ) : null}
          <div className="button-row toolbar-row">
            <button
              className="button"
              disabled={!selectedTemplateId || selectedRecipientIds.length === 0 || isSendingWhatsapp}
              onClick={handleSendWhatsapp}
              type="button"
            >
              {isSendingWhatsapp ? "Sending..." : "Send WhatsApp"}
            </button>
          </div>
        </div>
      </section>

      <section className="card card-span-full">
        <div className="card-header">
          <div>
            <h3>Send Log</h3>
            <p>Delivery queue and response history.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table adminlte-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Template</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Request ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.templateName}</td>
                    <td>
                      <div className="log-recipient-list">
                        {log.recipients.map((recipient) => (
                          <span key={`${log.id}-${recipient.userId}`}>
                            {recipient.name} ({recipient.phoneNumber})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          "badge",
                          log.status === "failed"
                            ? "warning"
                            : log.status === "queued"
                              ? "neutral"
                              : "success"
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{log.providerRequestId ?? "-"}</td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => openResendModal(log.id)}
                        type="button"
                      >
                        Resend
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No WhatsApp logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {resendLog ? (
        <div className="modal-backdrop" onClick={closeResendModal} role="presentation">
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <div>
                <h3>Preview Resend</h3>
                <p>{resendLog.templateName} | {resendLog.recipients.length} recipient(s)</p>
              </div>
              <button className="modal-close" onClick={closeResendModal} type="button">
                Close
              </button>
            </div>
            <div className="form-grid modal-form">
              <div className="template-preview-block">
                <div className="template-preview-head">
                  <strong>Template Preview</strong>
                  <span>{resendLog.templateName}</span>
                </div>
                <div className="template-preview-grid">
                  {resendLog.recipients.map((recipient) => (
                    <article className="template-preview-card" key={`${resendLog.id}-${recipient.userId}`}>
                      <p className="micro">
                        {recipient.name} | {recipient.phoneNumber}
                      </p>
                      <pre className="template-preview-message">
                        {renderWhatsappTemplatePreview(resendLog.templateName, resendLog.message, recipient)}
                      </pre>
                    </article>
                  ))}
                </div>
              </div>
              {sendErrorMessage ? <p className="form-feedback error">{sendErrorMessage}</p> : null}
              <div className="button-row">
                <button
                  className="button"
                  disabled={isResendingWhatsapp}
                  onClick={handleResendWhatsapp}
                  type="button"
                >
                  {isResendingWhatsapp ? "Resending..." : "Confirm Resend"}
                </button>
                <button
                  className="button secondary"
                  disabled={isResendingWhatsapp}
                  onClick={closeResendModal}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
  otpMessages,
  redeemCodes,
  redeemUsers,
  emailTemplates,
  emailLogs,
  emailRecipients,
  whatsappTemplates,
  whatsappLogs,
  whatsappRecipients
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
            <span className="topbar-chip muted">{stats.inboxCount} email</span>
          </div>
        </header>

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

        {activeTab === "redeem" ? (
          <RedeemSection redeemCodes={redeemCodes ?? []} users={redeemUsers ?? []} fullWidth />
        ) : null}

        {activeTab === "email" ? (
          <EmailSection
            templates={emailTemplates}
            logs={emailLogs}
            recipients={emailRecipients}
          />
        ) : null}

        {activeTab === "blast-email" ? <BlastEmailSection fullWidth /> : null}

        {activeTab === "whatsapp" ? (
          <WhatsappSection
            templates={whatsappTemplates}
            logs={whatsappLogs}
            recipients={whatsappRecipients}
          />
        ) : null}
      </div>
    </div>
  );
}
