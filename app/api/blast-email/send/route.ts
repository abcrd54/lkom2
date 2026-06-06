import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { sendBlastEmail, sendBlastEmailSchema } from "@/lib/blast-email";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = sendBlastEmailSchema.parse(await request.json());
    const result = await sendBlastEmail(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
