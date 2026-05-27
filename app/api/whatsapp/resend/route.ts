import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { resendWhatsappLog, resendWhatsappLogSchema } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = resendWhatsappLogSchema.parse(await request.json());
    const result = await resendWhatsappLog(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
