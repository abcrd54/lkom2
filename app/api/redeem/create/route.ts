import { createRedeemCode, createRedeemCodeSchema } from "@/lib/redeem-codes";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createRedeemCodeSchema.parse(await request.json());
    const redeemCode = await createRedeemCode(payload);
    return jsonOk({ redeemCode });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
