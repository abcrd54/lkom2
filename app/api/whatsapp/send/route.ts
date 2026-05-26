import { requireAdminSession } from "@/lib/auth";
import { sendWhatsappCampaign, sendWhatsappSchema } from "@/lib/whatsapp";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = sendWhatsappSchema.parse(await request.json());
    const result = await sendWhatsappCampaign(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
