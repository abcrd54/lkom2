import { requireAdminSession } from "@/lib/auth";
import { resendEmailLog, resendEmailLogSchema } from "@/lib/email-campaigns";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = resendEmailLogSchema.parse(await request.json());
    const result = await resendEmailLog(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
