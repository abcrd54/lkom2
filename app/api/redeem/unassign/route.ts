import { unassignRedeemCodeUserSchema, unassignUserFromRedeemCode } from "@/lib/redeem-codes";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = unassignRedeemCodeUserSchema.parse(await request.json());
    const result = await unassignUserFromRedeemCode(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
