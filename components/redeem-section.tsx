"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

type RedeemUserView = {
  id: string;
  name: string;
  phoneNumber: string;
  status: "active" | "disabled";
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
    user: RedeemUserView | null;
  }>;
};

type RedeemSectionProps = {
  redeemCodes: RedeemCodeView[];
  users: RedeemUserView[];
  fullWidth?: boolean;
};

type ApiResponse =
  | {
      ok: true;
      data?: {
        successCount?: number;
        failed?: Array<{ code?: string; reason: string }>;
      };
    }
  | {
      ok: false;
      error?: string;
    };

export function RedeemSection({ redeemCodes, users, fullWidth = false }: RedeemSectionProps) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"single" | "bulk" | null>(null);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [bulkCodes, setBulkCodes] = useState<string[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    successCount: number;
    failed: Array<{ code?: string; reason: string }>;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assigningCodeId, setAssigningCodeId] = useState<string | null>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectionByCode, setSelectionByCode] = useState<Record<string, string>>({});

  const activeUsers = useMemo(() => users.filter((user) => user.status === "active"), [users]);
  const assignedUserIds = useMemo(
    () =>
      new Set(
        redeemCodes.flatMap((item) => item.assignments.map((assignment) => assignment.userId))
      ),
    [redeemCodes]
  );

  const filteredCodes = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return redeemCodes;
    }

    return redeemCodes.filter((item) => {
      const assignmentText = item.assignments
        .map((assignment) => `${assignment.user?.name ?? ""} ${assignment.user?.phoneNumber ?? ""}`)
        .join(" ")
        .toLowerCase();

      return item.code.toLowerCase().includes(query) || assignmentText.includes(query);
    });
  }, [redeemCodes, search]);

  function closeModal() {
    setModalMode(null);
    setCode("");
    setBulkCodes([]);
    setBulkFileName(null);
    setBulkResult(null);
    setErrorMessage(null);
    setFeedback(null);
  }

  function openSingleModal() {
    closeModal();
    setModalMode("single");
  }

  function openBulkModal() {
    closeModal();
    setModalMode("bulk");
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

    const parsedCodes = rawRows
      .map((row) => {
        const normalizedEntries = Object.entries(row).reduce<Record<string, string>>(
          (accumulator, [key, value]) => {
            accumulator[normalizeHeaderKey(key)] = String(value ?? "").trim();
            return accumulator;
          },
          {}
        );

        return normalizedEntries.code ?? normalizedEntries.redeemcode ?? "";
      })
      .filter(Boolean);

    if (parsedCodes.length === 0) {
      throw new Error("Import file is empty or template headers are invalid.");
    }

    return parsedCodes;
  }

  function downloadTemplate() {
    const csv = "code\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "redeem-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setBulkResult(null);

    try {
      const parsedCodes = await parseBulkFile(file);
      setBulkCodes(parsedCodes);
      setBulkFileName(file.name);
    } catch (error) {
      setBulkCodes([]);
      setBulkFileName(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse import file.");
    }
  }

  async function handleCreateCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/redeem/create", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ code })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to create redeem code." : payload.error ?? "Failed to create redeem code.");
      }

      setFeedback(`Redeem code created: ${code.trim().toUpperCase()}`);
      setCode("");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create redeem code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkImport() {
    if (bulkCodes.length === 0) {
      setErrorMessage("Upload a CSV/XLS/XLSX file before importing.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/redeem/import", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ codes: bulkCodes })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to import redeem codes." : payload.error ?? "Failed to import redeem codes.");
      }

      setBulkResult({
        successCount: payload.data?.successCount ?? 0,
        failed: payload.data?.failed ?? []
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to import redeem codes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssign(redeemCodeId: string) {
    const userId = selectionByCode[redeemCodeId];

    if (!userId) {
      setErrorMessage("Select a user before assigning.");
      return;
    }

    setAssigningCodeId(redeemCodeId);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/redeem/assign", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          redeemCodeId,
          userId
        })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to assign user." : payload.error ?? "Failed to assign user.");
      }

      setFeedback("User assigned to redeem code.");
      setSelectionByCode((current) => ({ ...current, [redeemCodeId]: "" }));
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to assign user.");
    } finally {
      setAssigningCodeId(null);
    }
  }

  async function handleUnassign(redeemCodeUserId: string) {
    setRemovingAssignmentId(redeemCodeUserId);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/redeem/unassign", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          redeemCodeUserId
        })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to remove assignment." : payload.error ?? "Failed to remove assignment.");
      }

      setFeedback("Assignment removed.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove assignment.");
    } finally {
      setRemovingAssignmentId(null);
    }
  }

  return (
    <section className={cn("card", fullWidth && "card-span-full")}>
      <div className="card-header">
        <div>
          <h3>Redeem Code</h3>
          <p>Manage standalone redeem codes with a maximum of 3 users per code.</p>
        </div>
        <div className="button-row">
          <button className="button" onClick={openSingleModal} type="button">
            Add Code
          </button>
          <button className="button secondary" onClick={openBulkModal} type="button">
            Bulk Import
          </button>
        </div>
      </div>

      <div className="toolbar-inline">
        <div className="field search-field">
          <label htmlFor="redeem-search">Search code or user</label>
          <input
            id="redeem-search"
            placeholder="Search redeem code or assigned user"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {errorMessage ? <p className="form-feedback error redeem-feedback">{errorMessage}</p> : null}
      {feedback ? <p className="redeem-feedback success">{feedback}</p> : null}

      <div className="redeem-grid">
        {filteredCodes.length > 0 ? (
          filteredCodes.map((item) => {
            const availableUsers = activeUsers.filter((user) => !assignedUserIds.has(user.id));

            return (
              <article className="redeem-card" key={item.id}>
                <div className="redeem-card-head">
                  <div>
                    <h4>{item.code}</h4>
                    <p>{item.usedSlots}/3 used</p>
                  </div>
                  <span
                    className={cn(
                      "badge",
                      item.usedSlots >= 3 ? "warning" : item.usedSlots > 0 ? "success" : "neutral"
                    )}
                  >
                    {item.remainingSlots} slot left
                  </span>
                </div>

                <div className="redeem-assignments">
                  {item.assignments.length > 0 ? (
                    item.assignments.map((assignment) => (
                      <div className="redeem-assignment" key={assignment.id}>
                        <div>
                          <strong>{assignment.user?.name ?? "Unknown user"}</strong>
                          <span>{assignment.user?.phoneNumber ?? "-"}</span>
                        </div>
                        <button
                          className="mini-button"
                          disabled={removingAssignmentId === assignment.id}
                          onClick={() => handleUnassign(assignment.id)}
                          type="button"
                        >
                          {removingAssignmentId === assignment.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="micro">No user assigned yet.</p>
                  )}
                </div>

                <div className="redeem-assign-form">
                  <select
                    value={selectionByCode[item.id] ?? ""}
                    onChange={(event) =>
                      setSelectionByCode((current) => ({
                        ...current,
                        [item.id]: event.target.value
                      }))
                    }
                    disabled={item.usedSlots >= 3 || availableUsers.length === 0}
                  >
                    <option value="">Select user</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} | {user.phoneNumber}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={
                      item.usedSlots >= 3 ||
                      availableUsers.length === 0 ||
                      !selectionByCode[item.id] ||
                      assigningCodeId === item.id
                    }
                    onClick={() => handleAssign(item.id)}
                    type="button"
                  >
                    {assigningCodeId === item.id ? "Assigning..." : "Assign User"}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <article className="redeem-card redeem-card-empty">
            <h4>No redeem code found</h4>
            <p className="micro">Add a new code or adjust your search query.</p>
          </article>
        )}
      </div>

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
                <h3>{modalMode === "single" ? "Add Redeem Code" : "Bulk Import Redeem Codes"}</h3>
                <p>
                  {modalMode === "single"
                    ? "Create one standalone redeem code."
                    : "Upload CSV, XLS, or XLSX with a single code column."}
                </p>
              </div>
              <button className="modal-close" onClick={closeModal} type="button">
                Close
              </button>
            </div>

            {modalMode === "single" ? (
              <form className="form-grid modal-form" onSubmit={handleCreateCode}>
                <div className="field">
                  <label htmlFor="redeem-code">Redeem code</label>
                  <input
                    id="redeem-code"
                    placeholder="XXX-XXX-XXX"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                  />
                </div>
                {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
                {feedback ? <p className="redeem-feedback success">{feedback}</p> : null}
                <div className="button-row">
                  <button className="button" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Saving..." : "Create Code"}
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
                  <label htmlFor="redeem-bulk-file">Import file</label>
                  <input
                    id="redeem-bulk-file"
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleBulkFileChange}
                  />
                </div>
                <div className="import-template-note">
                  Template headers:
                  <code>code</code>
                </div>
                {bulkFileName ? (
                  <p className="micro">
                    {bulkFileName} | {bulkCodes.length} code(s) ready
                  </p>
                ) : null}
                {errorMessage ? <p className="form-feedback error">{errorMessage}</p> : null}
                {bulkResult ? (
                  <div className="form-feedback success-block">
                    <p className="success-title">{bulkResult.successCount} code(s) imported</p>
                    {bulkResult.failed.length > 0 ? (
                      <div className="bulk-failed-list">
                        {bulkResult.failed.map((failedRow, index) => (
                          <p className="micro" key={`${failedRow.code ?? "code"}-${index}`}>
                            {failedRow.code ? `${failedRow.code}: ` : ""}
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
                    disabled={isSubmitting || bulkCodes.length === 0}
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
