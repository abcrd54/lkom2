import { requireAdminSession } from "@/lib/auth";
import { getErrorMessage, jsonError, jsonOk } from "@/lib/http";
import { createSubMailAccount, createSubMailAccountSchema } from "@/lib/sub-mail-accounts";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const payload = createSubMailAccountSchema.parse(await request.json());
    const subMailAccount = await createSubMailAccount(payload);
    return jsonOk({ subMailAccount });
  } catch (error) {
    return jsonError(getErrorMessage(error), 400);
  }
}
