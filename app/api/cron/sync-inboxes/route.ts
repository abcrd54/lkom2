import { authorizeCronRequest } from "@/lib/cron";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  try {
    authorizeCronRequest(request);

    return jsonOk({
      message: "TODO: fetch Google and Microsoft inbox messages, parse OTP, and upsert otp_messages."
    });
  } catch (error) {
    return jsonError(getErrorMessage(error), 401);
  }
}
