import { requireAdminSession } from "@/lib/auth";
import {
  createWhatsappTemplate,
  createWhatsappTemplateSchema,
  deleteWhatsappTemplate,
  deleteWhatsappTemplateSchema,
  listWhatsappTemplates,
  updateWhatsappTemplate,
  updateWhatsappTemplateSchema
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

export async function PUT(request: Request) {
  try {
    await requireAdminSession();
    const payload = updateWhatsappTemplateSchema.parse(await request.json());
    const template = await updateWhatsappTemplate(payload);
    return jsonOk({ template });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminSession();
    const payload = deleteWhatsappTemplateSchema.parse(await request.json());
    const result = await deleteWhatsappTemplate(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
