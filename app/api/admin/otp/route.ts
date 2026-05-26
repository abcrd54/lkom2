import { requireAdminSession } from "@/lib/auth";
import { listAdminOtpMessages } from "@/lib/otp-messages";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const items = await listAdminOtpMessages({
      provider: searchParams.get("provider") ?? undefined,
      mailAccountId: searchParams.get("mailAccountId") ?? undefined,
      sender: searchParams.get("sender") ?? undefined,
      subject: searchParams.get("subject") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      page: searchParams.get("page") ?? undefined
    });

    return jsonOk(items);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
