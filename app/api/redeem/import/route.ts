import { bulkImportRedeemCodes, bulkImportRedeemCodesSchema } from "@/lib/redeem-codes";
import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = bulkImportRedeemCodesSchema.parse(await request.json());
    const result = await bulkImportRedeemCodes(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
