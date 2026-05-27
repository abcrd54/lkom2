import { jsonError, jsonOk } from "@/lib/http";
import { queryRedeemAccess } from "@/lib/redeem-access";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const { searchParams } = new URL(request.url);
  const refreshOtp = searchParams.get("refreshOtp") === "1";

  const result = await queryRedeemAccess(token, { refreshOtp });

  if (!result) {
    return jsonError("Link redeem tidak valid atau sudah dinonaktifkan admin.", 404);
  }

  return jsonOk(result);
}
