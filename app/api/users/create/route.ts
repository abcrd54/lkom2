import { buildAbsoluteAccessLink } from "@/lib/access-links";
import { requireAdminSession } from "@/lib/auth";
import { assignUserToRedeemCode, getRedeemCodeByCode, normalizeImportedRedeemCode } from "@/lib/redeem-codes";
import { createUser, createUserSchema, deleteUser } from "@/lib/users";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { getRequestOrigin } from "@/lib/request";
import { z } from "zod";

const createManagedUserSchema = createUserSchema.extend({
  codeRedeem: z.string().trim().optional().default("")
});

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createManagedUserSchema.parse(await request.json());
    const codeRedeem = normalizeImportedRedeemCode(payload.codeRedeem);

    if (!payload.subMailAccountId && !codeRedeem) {
      return jsonError("Select a sub account or provide a redeem code.", 400);
    }

    const redeemCode = codeRedeem ? await getRedeemCodeByCode(codeRedeem) : null;

    if (codeRedeem && !redeemCode) {
      return jsonError(`Redeem code not found: ${codeRedeem}`, 400);
    }

    const user = await createUser(payload);

    if (redeemCode) {
      try {
        await assignUserToRedeemCode({
          redeemCodeId: redeemCode.id,
          userId: user.id
        });
      } catch (error) {
        if (!payload.subMailAccountId) {
          await deleteUser({ userId: user.id });
          return jsonError(`Redeem assignment failed: ${getErrorMessage(error)}`, 400);
        }

        return jsonError(`User created but redeem assignment failed: ${getErrorMessage(error)}`, 400);
      }
    }

    const origin = getRequestOrigin(request);

    return jsonOk({
      user,
      accessLink: buildAbsoluteAccessLink(origin, user.accessToken)
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
