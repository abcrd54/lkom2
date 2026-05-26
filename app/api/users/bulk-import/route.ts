import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import {
  assignUserToRedeemCode,
  getRedeemCodeByCode,
  normalizeImportedRedeemCode
} from "@/lib/redeem-codes";
import { getActiveSubMailAccountByDisplayEmail } from "@/lib/sub-mail-accounts";
import { createUser, deleteUser } from "@/lib/users";
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

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = bulkImportUsersSchema.parse(await request.json());
    const failed: ImportFailure[] = [];
    const partial: ImportFailure[] = [];
    let successCount = 0;
    const subAccountCache = new Map<string, Awaited<ReturnType<typeof getActiveSubMailAccountByDisplayEmail>>>();
    const redeemCodeCache = new Map<string, Awaited<ReturnType<typeof getRedeemCodeByCode>>>();

    for (const [index, row] of payload.rows.entries()) {
      const rowNumber = index + 2;
      const emailConnect = row.emailConnect.trim().toLowerCase();
      const codeRedeem = normalizeImportedRedeemCode(row.codeRedeem);

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
            subMailAccount = await getActiveSubMailAccountByDisplayEmail(emailConnect);
            subAccountCache.set(emailConnect, subMailAccount);
          }

          if (!subMailAccount) {
            throw new Error(`Sub account not found or disabled: ${emailConnect}`);
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
                reason: getErrorMessage(error)
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
              reason: getErrorMessage(error)
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
          reason: getErrorMessage(error)
        });
      }
    }

    return jsonOk({
      successCount,
      partialCount: partial.length,
      failedCount: failed.length,
      partial,
      failed
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
