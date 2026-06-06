import { z } from "zod";
import { env } from "@/lib/env";
import {
  DEFAULT_BLAST_EMAIL_MESSAGE,
  DEFAULT_BLAST_EMAIL_PASSWORD,
  DEFAULT_BLAST_EMAIL_SUBJECT
} from "@/lib/blast-email-shared";

export const blastEmailRecipientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320)
});

export const sendBlastEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(60000),
  password: z.string().trim().min(1).max(120).default(DEFAULT_BLAST_EMAIL_PASSWORD),
  recipients: z.array(blastEmailRecipientSchema).min(1).max(200)
});

type BlastRecipient = z.infer<typeof blastEmailRecipientSchema>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatEmailInlineMarkup(value: string) {
  const escaped = escapeHtml(value);
  const withBold = escaped.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");

  return withBold.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#0f62fe;text-decoration:none;font-weight:700;">$1</a>'
  );
}

function renderEmailBodyHtml(message: string) {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 1 && lines.every((line) => /^\d+\./.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\d+\.\s*/, ""))
          .map((line) => `<li style="margin:0 0 8px;">${formatEmailInlineMarkup(line)}</li>`)
          .join("");
        return `<ol style="margin:0;padding-left:20px;color:#3c4858;">${items}</ol>`;
      }

      const content = lines.map((line) => formatEmailInlineMarkup(line)).join("<br />");
      return `<p style="margin:0;color:#3c4858;font-size:15px;line-height:1.75;">${content}</p>`;
    })
    .join('<div style="height:16px;line-height:16px;">&nbsp;</div>');
}

function renderEmailHtml(subject: string, message: string) {
  return `
    <div style="margin:0;padding:32px 16px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2d3d;">
      <div style="max-width:640px;margin:0 auto;">
        <div style="margin-bottom:16px;text-align:center;">
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#e8f0ff;color:#0f62fe;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">LKOM Generator</div>
        </div>
        <div style="background:#ffffff;border:1px solid #dbe4f0;border-radius:20px;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">
          <div style="padding:28px 28px 18px;background:linear-gradient(135deg,#0f62fe,#3aa0ff);color:#ffffff;">
            <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;">${escapeHtml(subject)}</h1>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.88);">Informasi akun dan langkah penggunaan platform LKOM Generator.</p>
          </div>
          <div style="padding:28px;">
            ${renderEmailBodyHtml(message)}
          </div>
        </div>
        <p style="margin:16px 0 0;text-align:center;color:#6b7785;font-size:12px;line-height:1.7;">Email ini dikirim otomatis oleh sistem LKOM.</p>
      </div>
    </div>
  `;
}

function renderTemplateValue(
  value: string,
  recipient: BlastRecipient,
  password: string
) {
  return value
    .replaceAll("{name}", recipient.name)
    .replaceAll("{email}", recipient.email)
    .replaceAll("{password}", password);
}

function getEmailDeliveryErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;

    if (typeof value.message === "string" && value.message.length > 0) {
      return value.message;
    }

    if (typeof value.error === "string" && value.error.length > 0) {
      return value.error;
    }
  }

  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  message: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: renderEmailHtml(input.subject, input.message),
      text: input.message,
      tags: [{ name: "channel", value: "blast_email" }]
    }),
    cache: "no-store"
  });

  const payload = await response.json();

  return {
    ok: response.ok && typeof payload?.id === "string",
    id: typeof payload?.id === "string" ? payload.id : null,
    payload
  };
}

export async function sendBlastEmail(input: z.infer<typeof sendBlastEmailSchema>) {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const deliveries: Array<{
    name: string;
    email: string;
    subject: string;
    ok: boolean;
    providerRequestId: string | null;
    errorMessage: string | null;
  }> = [];

  for (let index = 0; index < input.recipients.length; index += 2) {
    const batch = input.recipients.slice(index, index + 2);
    const results = await Promise.all(
      batch.map(async (recipient) => {
        const subject = renderTemplateValue(input.subject, recipient, input.password);
        const message = renderTemplateValue(input.message, recipient, input.password);
        const result = await sendResendEmail({
          to: recipient.email,
          subject,
          message
        });

        return {
          name: recipient.name,
          email: recipient.email,
          subject,
          ok: result.ok,
          providerRequestId: result.id,
          errorMessage: result.ok
            ? null
            : getEmailDeliveryErrorMessage(result.payload, "Email send failed.")
        };
      })
    );

    deliveries.push(...results);

    if (index + 2 < input.recipients.length) {
      await sleep(3000);
    }
  }

  const sentCount = deliveries.filter((delivery) => delivery.ok).length;
  const failed = deliveries.filter((delivery) => !delivery.ok);

  return {
    sentCount,
    failedCount: failed.length,
    totalCount: deliveries.length,
    deliveries,
    detail:
      failed.length === 0
        ? `Email sent to ${deliveries.length} recipient(s).`
        : `Email sent to ${sentCount}/${deliveries.length} recipient(s).`
  };
}
