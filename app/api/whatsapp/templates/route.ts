import { requireAdminSession } from "@/lib/auth";
import {
  createWhatsappTemplate,
  createWhatsappTemplateSchema,
  listWhatsappTemplates
} from "@/lib/whatsapp";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminSession();
    const items = await listWhatsappTemplates();
    return jsonOk({ items });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createWhatsappTemplateSchema.parse(await request.json());
    const template = await createWhatsappTemplate(payload);
    return jsonOk({ template });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
