import { authorizeCronRequest } from "@/lib/cron";
import { syncConnectedInboxes } from "@/lib/inbox-sync";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    authorizeCronRequest(request);
    const result = await syncConnectedInboxes();
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 401);
  }
}
