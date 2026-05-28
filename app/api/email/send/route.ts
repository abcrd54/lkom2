import { requireAdminSession } from "@/lib/auth";
import { sendEmailCampaign, sendEmailCampaignSchema } from "@/lib/email-campaigns";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = sendEmailCampaignSchema.parse(await request.json());
    const result = await sendEmailCampaign(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
