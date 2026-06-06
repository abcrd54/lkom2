"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  DEFAULT_BLAST_EMAIL_MESSAGE,
  DEFAULT_BLAST_EMAIL_PASSWORD,
  DEFAULT_BLAST_EMAIL_SUBJECT
} from "@/lib/blast-email-shared";
import { cn } from "@/lib/utils";

type BlastRecipient = {
  row: number;
  name: string;
  email: string;
};

type InvalidRow = {
  row: number;
  name: string;
  email: string;
  reason: string;
};

type ApiResponse =
  | {
      ok: true;
      data: {
        sentCount: number;
        failedCount: number;
        totalCount: number;
        detail: string;
        deliveries: Array<{
          name: string;
          email: string;
          subject: string;
          ok: boolean;
          providerRequestId: string | null;
          errorMessage: string | null;
        }>;
      };
    }
  | {
      ok: false;
      error?: string;
    };

type SendResult = {
  sentCount: number;
  failedCount: number;
  totalCount: number;
  detail: string;
  deliveries: Array<{
    name: string;
    email: string;
    subject: string;
    ok: boolean;
    providerRequestId: string | null;
    errorMessage: string | null;
  }>;
};

function normalizeHeaderKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function renderTemplatePreview(value: string, recipient: BlastRecipient, password: string) {
  return value
    .replaceAll("{name}", recipient.name)
    .replaceAll("{email}", recipient.email)
    .replaceAll("{password}", password);
}

export function BlastEmailSection({ fullWidth = false }: { fullWidth?: boolean }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [validRecipients, setValidRecipients] = useState<BlastRecipient[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);
  const [subject, setSubject] = useState(DEFAULT_BLAST_EMAIL_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_BLAST_EMAIL_MESSAGE);
  const [password, setPassword] = useState(DEFAULT_BLAST_EMAIL_PASSWORD);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const previewRecipients = useMemo(() => validRecipients.slice(0, 3), [validRecipients]);

  function resetImportState() {
    setFileName(null);
    setValidRecipients([]);
    setInvalidRows([]);
    setSendResult(null);
    setFeedback(null);
    setErrorMessage(null);
  }

  function downloadTemplate() {
    const csv = "name,email\nNama User,user@example.com\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "blast-email-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
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

    if (rawRows.length === 0) {
      throw new Error("Import file is empty.");
    }

    const valid: BlastRecipient[] = [];
    const invalid: InvalidRow[] = [];
    const seenEmails = new Map<string, number>();

    rawRows.forEach((row, index) => {
      const normalizedEntries = Object.entries(row).reduce<Record<string, string>>(
        (accumulator, [key, value]) => {
          accumulator[normalizeHeaderKey(key)] = String(value ?? "").trim();
          return accumulator;
        },
        {}
      );

      const rowNumber = index + 2;
      const name =
        normalizedEntries.name ??
        normalizedEntries.nama ??
        normalizedEntries.fullname ??
        normalizedEntries.namalengkap ??
        "";
      const emailRaw =
        normalizedEntries.email ??
        normalizedEntries.alamatemail ??
        normalizedEntries.emailaddress ??
        normalizedEntries.mail ??
        "";
      const email = emailRaw.trim().toLowerCase();

      if (!name || !email) {
        invalid.push({
          row: rowNumber,
          name,
          email,
          reason: "Row must include name and email."
        });
        return;
      }

      if (!isValidEmail(email)) {
        invalid.push({
          row: rowNumber,
          name,
          email,
          reason: "Email format is invalid."
        });
        return;
      }

      const firstSeen = seenEmails.get(email);
      if (firstSeen) {
        invalid.push({
          row: rowNumber,
          name,
          email,
          reason: `Duplicate email in file (first used on row ${firstSeen}).`
        });
        return;
      }

      seenEmails.set(email, rowNumber);
      valid.push({
        row: rowNumber,
        name,
        email
      });
    });

    if (valid.length === 0) {
      throw new Error("No valid recipient found in file.");
    }

    return {
      valid,
      invalid
    };
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setErrorMessage(null);
    setFeedback(null);
    setSendResult(null);

    try {
      const parsed = await parseBulkFile(file);
      setFileName(file.name);
      setValidRecipients(parsed.valid);
      setInvalidRows(parsed.invalid);
    } catch (error) {
      resetImportState();
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse import file.");
    }
  }

  async function handleSend() {
    if (validRecipients.length === 0) {
      setErrorMessage("Upload and verify recipients before sending.");
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setFeedback(null);
    setSendResult(null);

    try {
      const response = await fetch("/api/blast-email/send", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          subject,
          message,
          password,
          recipients: validRecipients.map((recipient) => ({
            name: recipient.name,
            email: recipient.email
          }))
        })
      });

      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to send blast email." : payload.error ?? "Failed to send blast email.");
      }

      setSendResult(payload.data);
      setFeedback(payload.data.detail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send blast email.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="content-grid">
      <section className={cn("card", fullWidth && "card-span-full")}>
        <div className="card-header">
          <div>
            <h3>Blast Email</h3>
            <p>Upload Excel, verify recipients, then send Resend email in batches of 2 with a 3-second delay.</p>
          </div>
          <div className="button-row">
            <button className="button secondary" onClick={downloadTemplate} type="button">
              Download Template
            </button>
            <button className="button secondary" onClick={resetImportState} type="button">
              Reset
            </button>
          </div>
        </div>

        <div className="form-grid admin-form">
          <div className="field">
            <label htmlFor="blast-email-file">Recipient File</label>
            <input
              id="blast-email-file"
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileChange}
            />
          </div>
          <div className="import-template-note">
            Template headers:
            <code>name</code>
            <code>email</code>
          </div>
          {fileName ? (
            <p className="micro">
              {fileName} | {validRecipients.length} valid recipient(s) | {invalidRows.length} invalid row(s)
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="blast-email-subject">Subject</label>
            <input
              id="blast-email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Email subject"
            />
          </div>
          <div className="field">
            <label htmlFor="blast-email-password">Default Password</label>
            <input
              id="blast-email-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Default password"
            />
          </div>
          <div className="field textarea-field">
            <label htmlFor="blast-email-message">Body Template</label>
            <textarea
              id="blast-email-message"
              rows={14}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write the blast email body here"
            />
          </div>
          <div className="import-template-note">
            Available variables:
            <code>{`{name}`}</code>
            <code>{`{email}`}</code>
            <code>{`{password}`}</code>
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
              disabled={isSending || validRecipients.length === 0}
              onClick={handleSend}
              type="button"
            >
              {isSending ? "Sending..." : "Send Blast Email"}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h3>Verification</h3>
            <p>Review parsed recipients before sending.</p>
          </div>
        </div>
        <div className="small-box-grid">
          <article className="small-box blue">
            <div>
              <p>Valid</p>
              <strong>{validRecipients.length}</strong>
            </div>
            <span className="small-box-icon">OK</span>
          </article>
          <article className="small-box amber">
            <div>
              <p>Invalid</p>
              <strong>{invalidRows.length}</strong>
            </div>
            <span className="small-box-icon">!</span>
          </article>
        </div>
        <div className="table-wrap">
          <table className="data-table adminlte-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Name</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {previewRecipients.length > 0 ? (
                previewRecipients.map((recipient) => (
                  <tr key={`${recipient.row}-${recipient.email}`}>
                    <td>{recipient.row}</td>
                    <td>{recipient.name}</td>
                    <td>{recipient.email}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No verified recipients yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {invalidRows.length > 0 ? (
          <div className="bulk-failed-list">
            {invalidRows.slice(0, 10).map((row) => (
              <p className="micro" key={`${row.row}-${row.email}-${row.reason}`}>
                Row {row.row}: {row.reason}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card card-span-full">
        <div className="card-header">
          <div>
            <h3>Preview</h3>
            <p>Rendered preview for the first verified recipients.</p>
          </div>
        </div>
        <div className="template-preview-grid">
          {previewRecipients.length > 0 ? (
            previewRecipients.map((recipient) => (
              <article className="template-preview-card" key={`preview-${recipient.row}-${recipient.email}`}>
                <p className="micro">
                  {recipient.name} | {recipient.email}
                </p>
                <pre className="template-preview-message">
                  Subject: {renderTemplatePreview(subject, recipient, password)}
                  {"\n\n"}
                  {renderTemplatePreview(message, recipient, password)}
                </pre>
              </article>
            ))
          ) : (
            <article className="template-preview-card">
              <p className="micro">Upload a file to see the blast email preview.</p>
            </article>
          )}
        </div>
        {sendResult?.failedCount ? (
          <div className="bulk-failed-list">
            {sendResult.deliveries
              .filter((delivery) => !delivery.ok)
              .map((delivery) => (
                <p className="micro" key={`${delivery.email}-${delivery.subject}`}>
                  {delivery.email}: {delivery.errorMessage ?? "Email send failed."}
                </p>
              ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
