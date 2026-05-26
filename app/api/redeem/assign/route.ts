import { assignRedeemCodeUserSchema, assignUserToRedeemCode } from "@/lib/redeem-codes";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = assignRedeemCodeUserSchema.parse(await request.json());
    const assignment = await assignUserToRedeemCode(payload);
    return jsonOk({ assignment });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
