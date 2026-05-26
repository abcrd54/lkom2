import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { listMailAccounts } from "@/lib/mail-accounts";

export async function GET() {
  try {
    await requireAdminSession();
    const items = await listMailAccounts();

    return jsonOk({ items });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
