import { requireAdminSession } from "@/lib/auth";
import {
  createEmailTemplate,
  createEmailTemplateSchema,
  deleteEmailTemplate,
  deleteEmailTemplateSchema,
  listEmailTemplates,
  updateEmailTemplate,
  updateEmailTemplateSchema
} from "@/lib/email-campaigns";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminSession();
    const items = await listEmailTemplates();
    return jsonOk({ items });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createEmailTemplateSchema.parse(await request.json());
    const template = await createEmailTemplate(payload);
    return jsonOk({ template });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminSession();
    const payload = updateEmailTemplateSchema.parse(await request.json());
    const template = await updateEmailTemplate(payload);
    return jsonOk({ template });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminSession();
    const payload = deleteEmailTemplateSchema.parse(await request.json());
    const result = await deleteEmailTemplate(payload);
    return jsonOk(result);
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
