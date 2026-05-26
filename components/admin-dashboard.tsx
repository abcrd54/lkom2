"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { ConnectProviderButton } from "@/components/connect-provider-buttons";
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
  const [modalMode, setModalMode] = useState<"single" | "bulk" | null>(null);
  const [userSearch, setUserSearch] = useState(users?.searchQuery ?? "");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mailAccountId, setMailAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdAccessLink, setCreatedAccessLink] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<
    Array<{ name: string; phoneNumber: string; inboxEmail: string }>
  >([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    successCount: number;
    failed: Array<{ row: number; reason: string }>;
  } | null>(null);

  const activeMailAccounts = mailAccounts.filter((account) => account.status !== "disabled");
  const inboxIdByEmail = new Map(
    activeMailAccounts.map((account) => [account.emailAddress.trim().toLowerCase(), account.id])
  );
  const [copiedAccessUserId, setCopiedAccessUserId] = useState<string | null>(null);
  const filteredUsers =
    users?.items.filter((user) => {
      const query = userSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return (
        user.name.toLowerCase().includes(query) ||
        user.phoneNumber.toLowerCase().includes(query) ||
        user.inboxAddress.toLowerCase().includes(query)
      );
    }) ?? [];

  function resetSingleFormState() {
    setName("");
    setPhoneNumber("");
    setMailAccountId("");
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
      await navigator.clipboard.writeText(`${window.location.origin}${buildAccessPath(token)}`);
      setCopiedAccessUserId(userId);
      window.setTimeout(() => {
        setCopiedAccessUserId((current) => (current === userId ? null : current));
      }, 1800);
    } catch {
      setCopiedAccessUserId(null);
    }
  }

  function downloadTemplate() {
    const csv = "name,phoneNumber,inboxEmail\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "user-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function normalizeHeaderKey(value: string) {
    return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
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
      defval: ""
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
          phoneNumber: normalizedEntries.phonenumber ?? "",
          inboxEmail:
            normalizedEntries.inboxemail ?? normalizedEntries.inbox ?? normalizedEntries.email ?? ""
        };
      })
      .filter((row) => row.name || row.phoneNumber || row.inboxEmail);

    if (parsedRows.length === 0) {
      throw new Error("Import file is empty or template headers are invalid.");
    }

    const invalidRow = parsedRows.find(
      (row) => !row.name || !row.phoneNumber || !row.inboxEmail
    );

    if (invalidRow) {
      throw new Error("Each import row must include name, phoneNumber, and inboxEmail.");
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

  async function handleBulkImport() {
    if (bulkRows.length === 0) {
      setErrorMessage("Upload a CSV/XLS/XLSX file before importing.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setBulkResult(null);

    const failed: Array<{ row: number; reason: string }> = [];
    let successCount = 0;

    try {
      for (const [index, row] of bulkRows.entries()) {
        setBulkProgress(`Importing ${index + 1} of ${bulkRows.length}...`);
        const mailAccountIdForRow = inboxIdByEmail.get(row.inboxEmail.trim().toLowerCase());

        if (!mailAccountIdForRow) {
          failed.push({
            row: index + 2,
            reason: `Inbox not found or disabled: ${row.inboxEmail}`
          });
          continue;
        }

        try {
          const response = await fetch("/api/users/create", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              name: row.name,
              phoneNumber: row.phoneNumber,
              mailAccountId: mailAccountIdForRow
            })
          });

          const payload = (await response.json()) as
            | {
                ok: true;
              }
            | {
                ok: false;
                error?: string;
              };

          if (!response.ok || !payload.ok) {
            throw new Error(payload.ok ? "Failed to create user." : payload.error ?? "Failed to create user.");
          }

          successCount += 1;
        } catch (error) {
          failed.push({
            row: index + 2,
            reason: error instanceof Error ? error.message : "Failed to create user."
          });
        }
      }

      setBulkResult({
        successCount,
        failed
      });
      setBulkProgress(null);
      router.refresh();
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
        <div className="button-row">
          <button className="button" onClick={openSingleModal} type="button">
            Add User
          </button>
          <button className="button secondary" onClick={openBulkModal} type="button">
            Bulk Import
          </button>
        </div>
      </div>
      <div className="toolbar-inline">
        <div className="field search-field">
          <label htmlFor="user-search">Search user</label>
          <input
            id="user-search"
            name="user-search"
            placeholder="Search name, phone, or inbox"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
          />
        </div>
      </div>

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
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
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
                  <td>
                    <div className="access-link-cell">
                      <span>{buildAccessPath(user.accessToken)}</span>
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
                <td colSpan={6}>
                  {users?.items.length ? "No users match your search." : "No users in database yet."}
                </td>
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
                    ? "Create one user and generate a dedicated access link."
                    : "Upload CSV, XLS, or XLSX using the import template headers."}
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
                  <label htmlFor="modal-phone">Phone</label>
                  <input
                    id="modal-phone"
                    name="phone"
                    placeholder="081234567890"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="modal-inbox">Inbox</label>
                  <select
                    id="modal-inbox"
                    name="inbox"
                    value={mailAccountId}
                    onChange={(event) => setMailAccountId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select active inbox
                    </option>
                    {activeMailAccounts.map((account) => (
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
                  <code>name,phoneNumber,inboxEmail</code>
                </div>
                {bulkFileName ? (
                  <p className="micro">
                    {bulkFileName} · {bulkRows.length} row(s) ready
                  </p>
                ) : null}
                {bulkProgress ? <p className="micro">{bulkProgress}</p> : null}
                {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
                {bulkResult ? (
                  <div className="form-feedback success-block">
                    <p className="success-title">{bulkResult.successCount} user(s) imported</p>
                    {bulkResult.failed.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.failed.map((failedRow) => (
                          <p className="micro" key={`${failedRow.row}-${failedRow.reason}`}>
                            Row {failedRow.row}: {failedRow.reason}
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
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredRecipients = recipients.filter((recipient) => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      recipient.name.toLowerCase().includes(query) ||
      recipient.phoneNumber.toLowerCase().includes(query)
    );
  });
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedRecipients = recipients.filter((recipient) =>
    selectedRecipientIds.includes(recipient.id)
  );

  function renderWhatsappTemplatePreview(
    message: string,
    recipient: {
      name: string;
      phoneNumber: string;
      email: string;
      accessLink: string;
      redeemCode: string | null;
      redeemLink: string;
    }
  ) {
    return message
      .replaceAll("{name}", recipient.name)
      .replaceAll("{phone}", recipient.phoneNumber)
      .replaceAll("{email}", recipient.email || "-")
      .replaceAll("{link}", recipient.accessLink)
      .replaceAll("{code}", recipient.redeemCode ?? "-")
      .replaceAll("{redeem_link}", recipient.redeemLink);
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

  async function handleCreateTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingTemplate(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: templateName,
          message: templateMessage
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Failed to save WhatsApp template.");
      }

      setFeedback(`Template saved: ${payload.data.template.name}`);
      setTemplateName("");
      setTemplateMessage("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save WhatsApp template.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleSendWhatsapp() {
    setIsSendingWhatsapp(true);
    setErrorMessage(null);
    setFeedback(null);

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

      setFeedback(payload.data.detail ?? "WhatsApp message queued.");
      setSelectedRecipientIds([]);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send WhatsApp message.");
    } finally {
      setIsSendingWhatsapp(false);
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
        <form className="form-grid admin-form" onSubmit={handleCreateTemplate}>
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
          <div className="button-row toolbar-row">
            <button className="button" disabled={isSavingTemplate} type="submit">
              {isSavingTemplate ? "Saving..." : "Save Template"}
            </button>
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
            <div className="template-preview-block">
              <div className="template-preview-head">
                <strong>Template Preview</strong>
                <span>{selectedTemplate.name}</span>
              </div>
              <div className="template-preview-grid">
                {(selectedRecipients.length > 0 ? selectedRecipients : recipients.slice(0, 1)).map(
                  (recipient) => (
                    <article className="template-preview-card" key={recipient.id}>
                      <p className="micro">
                        {recipient.name} · {recipient.phoneNumber}
                      </p>
                      <pre className="template-preview-message">
                        {renderWhatsappTemplatePreview(selectedTemplate.message, recipient)}
                      </pre>
                    </article>
                  )
                )}
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
          {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
          {feedback ? (
            <div className="form-feedback success-block">
              <p className="success-title">{feedback}</p>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No WhatsApp logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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
                    : activeTab === "otp-inbox"
                      ? "Review recent OTP messages."
                      : activeTab === "redeem"
                        ? "Create standalone redeem codes and assign up to 3 users."
                        : "Prepare templates, choose recipients, and send WhatsApp."}
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

        {activeTab === "redeem" ? (
          <RedeemSection redeemCodes={redeemCodes ?? []} users={redeemUsers ?? []} fullWidth />
        ) : null}

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
