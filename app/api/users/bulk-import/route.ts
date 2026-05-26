import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import {
  assignUserToRedeemCode,
  getRedeemCodeByCode,
  normalizeImportedRedeemCode
} from "@/lib/redeem-codes";
import { resolveActiveInboxSlotByEmail } from "@/lib/sub-mail-accounts";
import { createUser, deleteUser, normalizeUserPhoneNumber } from "@/lib/users";
import { z } from "zod";

const bulkImportRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(8).max(30),
  emailConnect: z.string().trim().optional().default(""),
  codeRedeem: z.string().trim().optional().default("")
});

const bulkImportUsersSchema = z.object({
  rows: z.array(bulkImportRowSchema).min(1).max(500)
});

type ImportFailure = {
  row: number;
  name: string;
  phoneNumber: string;
  emailConnect: string;
  codeRedeem: string;
  reason: string;
};

type ImportReasonSummary = {
  reason: string;
  count: number;
};

function hasScientificNotation(value: string) {
  return /^\d+(\.\d+)?e[+-]?\d+$/i.test(value.trim());
}

function formatImportFailureReason(
  error: unknown,
  context: Pick<ImportFailure, "emailConnect" | "codeRedeem">
) {
  const message = getErrorMessage(error);

  if (message.startsWith("Inbox slot not found or disabled:")) {
    return `Inbox "${context.emailConnect}" was not found or is disabled.`;
  }

  const subAccountLimitMatch = message.match(/sub mail account already has maximum (\d+) active users/i);
  if (subAccountLimitMatch) {
    return `Inbox "${context.emailConnect}" is full (${subAccountLimitMatch[1]} active users max).`;
  }

  if (message.startsWith("Phone number is already used by ")) {
    return message;
  }

  if (message.startsWith("Redeem code not found:")) {
    return `Redeem code "${context.codeRedeem}" was not found.`;
  }

  if (/redeem code already has maximum 3 users/i.test(message)) {
    return `Redeem code "${context.codeRedeem}" is full (3 users max).`;
  }

  if (/user already has a redeem code/i.test(message)) {
    return "This user already has a redeem code assigned.";
  }

  return message;
}

function buildReasonSummary(items: ImportFailure[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = bulkImportUsersSchema.parse(await request.json());
    const failed: ImportFailure[] = [];
    const partial: ImportFailure[] = [];
    let successCount = 0;
    const subAccountCache = new Map<string, Awaited<ReturnType<typeof resolveActiveInboxSlotByEmail>>>();
    const redeemCodeCache = new Map<string, Awaited<ReturnType<typeof getRedeemCodeByCode>>>();
    const firstRowByPhone = new Map<string, number>();

    for (const [index, row] of payload.rows.entries()) {
      const rowNumber = index + 2;
      const emailConnect = row.emailConnect.trim().toLowerCase();
      const codeRedeem = normalizeImportedRedeemCode(row.codeRedeem);
      const rawPhoneNumber = row.phoneNumber.trim();
      const normalizedPhoneNumber = normalizeUserPhoneNumber(row.phoneNumber);

      if (hasScientificNotation(rawPhoneNumber)) {
        failed.push({
          row: rowNumber,
          name: row.name,
          phoneNumber: row.phoneNumber,
          emailConnect,
          codeRedeem,
          reason:
            "Phone number is stored in scientific notation. Re-export the file with the phoneNumber column formatted as Text."
        });
        continue;
      }

      const firstSeenRow = firstRowByPhone.get(normalizedPhoneNumber);
      if (firstSeenRow) {
        failed.push({
          row: rowNumber,
          name: row.name,
          phoneNumber: row.phoneNumber,
          emailConnect,
          codeRedeem,
          reason: `Phone number is duplicated in this import file (first used on row ${firstSeenRow}).`
        });
        continue;
      }

      firstRowByPhone.set(normalizedPhoneNumber, rowNumber);

      if (!emailConnect && !codeRedeem) {
        failed.push({
          row: rowNumber,
          name: row.name,
          phoneNumber: row.phoneNumber,
          emailConnect,
          codeRedeem,
          reason: "Row must include email_connect or code_redeem."
        });
        continue;
      }

      let targetUserId: string | null = null;
      let createdNewUser = false;

      try {
        if (emailConnect) {
          let subMailAccount = subAccountCache.get(emailConnect);

          if (subMailAccount === undefined) {
            subMailAccount = await resolveActiveInboxSlotByEmail(emailConnect);
            subAccountCache.set(emailConnect, subMailAccount);
          }

          if (!subMailAccount) {
            throw new Error(`Inbox slot not found or disabled: ${emailConnect}`);
          }

          const user = await createUser({
            name: row.name,
            phoneNumber: row.phoneNumber,
            subMailAccountId: subMailAccount.id
          });

          targetUserId = user.id;
          createdNewUser = true;
        } else {
          const user = await createUser({
            name: row.name,
            phoneNumber: row.phoneNumber,
            subMailAccountId: null
          });

          targetUserId = user.id;
          createdNewUser = true;
        }

        if (codeRedeem) {
          try {
            let redeemCode = redeemCodeCache.get(codeRedeem);

            if (redeemCode === undefined) {
              redeemCode = await getRedeemCodeByCode(codeRedeem);
              redeemCodeCache.set(codeRedeem, redeemCode);
            }

            if (!redeemCode) {
              throw new Error(`Redeem code not found: ${codeRedeem}`);
            }

            await assignUserToRedeemCode({
              redeemCodeId: redeemCode.id,
              userId: targetUserId
            });
          } catch (error) {
            if (!emailConnect && createdNewUser && targetUserId) {
              await deleteUser({ userId: targetUserId });
              failed.push({
                row: rowNumber,
                name: row.name,
                phoneNumber: row.phoneNumber,
                emailConnect,
                codeRedeem,
                reason: formatImportFailureReason(error, { emailConnect, codeRedeem })
              });
              continue;
            }

            const targetList = createdNewUser ? partial : failed;
            targetList.push({
              row: rowNumber,
              name: row.name,
              phoneNumber: row.phoneNumber,
              emailConnect,
              codeRedeem,
              reason: formatImportFailureReason(error, { emailConnect, codeRedeem })
            });
            continue;
          }
        }

        successCount += 1;
      } catch (error) {
        failed.push({
          row: rowNumber,
          name: row.name,
          phoneNumber: row.phoneNumber,
          emailConnect,
          codeRedeem,
          reason: formatImportFailureReason(error, { emailConnect, codeRedeem })
        });
      }
    }

    return jsonOk({
      successCount,
      partialCount: partial.length,
      failedCount: failed.length,
      partial,
      failed,
      partialSummary: buildReasonSummary(partial),
      failedSummary: buildReasonSummary(failed)
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
